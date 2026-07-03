import type { PrismaClient } from "@/generated/prisma/client";

// Normaliza uma descrição para comparação: maiúsculas, sem acentos, sem
// dígitos (números de loja/parcela variam entre compras do mesmo
// estabelecimento) e sem pontuação.
export function normalizarDescricao(descricao: string): string {
  return descricao
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\d+/g, " ")
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Similaridade de Jaccard sobre o conjunto de palavras normalizadas —
// simples e suficiente para comparar descrições curtas de extrato/fatura.
export function similaridade(a: string, b: string): number {
  const palavrasA = new Set(normalizarDescricao(a).split(" ").filter(Boolean));
  const palavrasB = new Set(normalizarDescricao(b).split(" ").filter(Boolean));
  if (palavrasA.size === 0 || palavrasB.size === 0) return 0;

  let intersecao = 0;
  for (const palavra of palavrasA) {
    if (palavrasB.has(palavra)) intersecao++;
  }
  const uniao = new Set([...palavrasA, ...palavrasB]).size;
  return intersecao / uniao;
}

export type CandidatoSugestao = {
  descricaoOrigem: string;
  categoriaId: string;
  subcategoriaId: string | null;
};

export type SugestaoCategoria = {
  categoriaId: string;
  subcategoriaId: string | null;
  origemDescricao: string;
  similaridade: number;
};

const LIMIAR_SIMILARIDADE = 0.5;
const MAX_CANDIDATOS = 1000;

// Busca lançamentos anteriores com categoria definida, mais recentes
// primeiro, para servir de base de comparação (RF06).
export async function buscarCandidatosSugestao(
  prisma: PrismaClient,
  householdId: string,
): Promise<CandidatoSugestao[]> {
  const lancamentos = await prisma.lancamento.findMany({
    where: {
      householdId,
      categoriaId: { not: null },
      descricaoOrigem: { not: null },
    },
    select: { descricaoOrigem: true, categoriaId: true, subcategoriaId: true },
    orderBy: { createdAt: "desc" },
    take: MAX_CANDIDATOS,
  });

  return lancamentos
    .filter((l) => l.descricaoOrigem && l.categoriaId)
    .map((l) => ({
      descricaoOrigem: l.descricaoOrigem as string,
      categoriaId: l.categoriaId as string,
      subcategoriaId: l.subcategoriaId,
    }));
}

// Encontra, entre os candidatos, o lançamento anterior com descrição mais
// parecida (função pura — sem acesso a banco — para ser testável isolada).
export function melhorCandidato(
  descricaoOrigem: string,
  candidatos: CandidatoSugestao[],
): SugestaoCategoria | null {
  if (!descricaoOrigem.trim()) return null;

  let melhor: SugestaoCategoria | null = null;
  for (const candidato of candidatos) {
    const score = similaridade(descricaoOrigem, candidato.descricaoOrigem);
    if (
      score >= LIMIAR_SIMILARIDADE &&
      (!melhor || score > melhor.similaridade)
    ) {
      melhor = {
        categoriaId: candidato.categoriaId,
        subcategoriaId: candidato.subcategoriaId,
        origemDescricao: candidato.descricaoOrigem,
        similaridade: score,
      };
    }
  }
  return melhor;
}

// Sugere categoria/subcategoria para uma nova linha de importação com base
// no lançamento anterior mais parecido (por descrição) que já tenha
// categoria definida (RF06).
export async function sugerirCategoria(
  prisma: PrismaClient,
  householdId: string,
  descricaoOrigem: string,
): Promise<SugestaoCategoria | null> {
  const candidatos = await buscarCandidatosSugestao(prisma, householdId);
  return melhorCandidato(descricaoOrigem, candidatos);
}
