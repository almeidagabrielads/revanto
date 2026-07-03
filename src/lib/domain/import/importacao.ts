import type { PrismaClient } from "@/generated/prisma/client";
import { parseImportacao, type ErroImportacao } from "./parser";
import { buscarTemplate } from "./templates";
import { calcularHashImportacao } from "./hash";
import { buscarCandidatosSugestao, melhorCandidato } from "./sugestaoCategoria";

export type LinhaPreview = {
  numeroLinha: number;
  data: string;
  descricaoOrigem: string;
  valorCentavos: number;
  hash: string;
  duplicado: boolean;
  categoriaSugeridaId: string | null;
  subcategoriaSugeridaId: string | null;
};

export type ResultadoPreview =
  | { ok: true; linhas: LinhaPreview[]; erros: ErroImportacao[] }
  | { ok: false; erro: string };

// Faz o parsing do CSV e monta o preview de importação (RF06): marca linhas
// já importadas anteriormente (mesmo hash de data+descrição+valor+banco) e
// sugere categoria/subcategoria com base em lançamentos anteriores
// parecidos. Não grava nada no banco.
export async function gerarPreviewImportacao(
  prisma: PrismaClient,
  householdId: string,
  opts: { bancoId: string; templateId: string; csvTexto: string },
): Promise<ResultadoPreview> {
  const banco = await prisma.banco.findFirst({
    where: { id: opts.bancoId, householdId },
  });
  if (!banco) return { ok: false, erro: "Banco inválido." };

  const template = buscarTemplate(opts.templateId);
  if (!template) return { ok: false, erro: "Modelo de importação inválido." };

  const { linhas, erros } = parseImportacao(opts.csvTexto, template);

  const hashes = linhas.map((linha) =>
    calcularHashImportacao({
      data: linha.data,
      descricaoOrigem: linha.descricaoOrigem,
      valorCentavos: linha.valorCentavos,
      bancoId: opts.bancoId,
    }),
  );

  const existentes = await prisma.lancamento.findMany({
    where: { householdId, hashImportacao: { in: hashes } },
    select: { hashImportacao: true },
  });
  const hashesExistentes = new Set(existentes.map((e) => e.hashImportacao));

  const candidatos = await buscarCandidatosSugestao(prisma, householdId);

  const previewLinhas: LinhaPreview[] = linhas.map((linha, indice) => {
    const hash = hashes[indice];
    const duplicado = hashesExistentes.has(hash);
    const sugestao = duplicado
      ? null
      : melhorCandidato(linha.descricaoOrigem, candidatos);

    return {
      numeroLinha: linha.numeroLinha,
      data: linha.data.toISOString().slice(0, 10),
      descricaoOrigem: linha.descricaoOrigem,
      valorCentavos: linha.valorCentavos,
      hash,
      duplicado,
      categoriaSugeridaId: sugestao?.categoriaId ?? null,
      subcategoriaSugeridaId: sugestao?.subcategoriaId ?? null,
    };
  });

  return { ok: true, linhas: previewLinhas, erros };
}

export type LinhaConfirmacao = {
  data: string;
  descricaoOrigem: string;
  valorCentavos: number;
  categoriaId?: string | null;
  subcategoriaId?: string | null;
};

export type ResultadoConfirmacao =
  | { ok: true; criados: number; duplicadosIgnorados: number }
  | { ok: false; erro: string };

// Grava as linhas selecionadas pelo usuário na tela de preview. Linhas cujo
// hash já exista para o household são ignoradas silenciosamente (proteção
// extra além da checagem feita no preview, contra corrida entre telas).
export async function confirmarImportacao(
  prisma: PrismaClient,
  householdId: string,
  opts: {
    bancoId: string;
    pessoaDivisaoId: string;
    pessoaPagouId: string;
    linhas: LinhaConfirmacao[];
  },
): Promise<ResultadoConfirmacao> {
  const [banco, pessoaDivisao, pessoaPagou] = await Promise.all([
    prisma.banco.findFirst({ where: { id: opts.bancoId, householdId } }),
    prisma.pessoa.findFirst({
      where: { id: opts.pessoaDivisaoId, householdId },
    }),
    prisma.pessoa.findFirst({ where: { id: opts.pessoaPagouId, householdId } }),
  ]);
  if (!banco || !pessoaDivisao || !pessoaPagou) {
    return { ok: false, erro: "Banco ou pessoa inválidos." };
  }
  if (opts.linhas.length === 0) {
    return { ok: false, erro: "Nenhuma linha para importar." };
  }

  const categoriaIds = [
    ...new Set(
      opts.linhas.map((l) => l.categoriaId).filter((v): v is string => !!v),
    ),
  ];
  const subcategoriaIds = [
    ...new Set(
      opts.linhas.map((l) => l.subcategoriaId).filter((v): v is string => !!v),
    ),
  ];
  const [categorias, subcategorias] = await Promise.all([
    prisma.categoria.findMany({
      where: { id: { in: categoriaIds }, householdId },
    }),
    prisma.subcategoria.findMany({
      where: { id: { in: subcategoriaIds }, householdId },
    }),
  ]);
  const categoriasValidas = new Set(categorias.map((c) => c.id));
  const subcategoriasPorId = new Map(subcategorias.map((s) => [s.id, s]));

  const dados = [];
  for (const linha of opts.linhas) {
    if (linha.categoriaId && !categoriasValidas.has(linha.categoriaId)) {
      return {
        ok: false,
        erro: `Categoria inválida na linha "${linha.descricaoOrigem}".`,
      };
    }
    if (linha.subcategoriaId) {
      const subcategoria = subcategoriasPorId.get(linha.subcategoriaId);
      if (!subcategoria || subcategoria.categoriaId !== linha.categoriaId) {
        return {
          ok: false,
          erro: `Subcategoria inválida na linha "${linha.descricaoOrigem}".`,
        };
      }
    }

    const data = new Date(linha.data);
    const hash = calcularHashImportacao({
      data,
      descricaoOrigem: linha.descricaoOrigem,
      valorCentavos: linha.valorCentavos,
      bancoId: opts.bancoId,
    });

    dados.push({
      data,
      descricaoOrigem: linha.descricaoOrigem,
      valorCentavos: linha.valorCentavos,
      categoriaId: linha.categoriaId ?? null,
      subcategoriaId: linha.subcategoriaId ?? null,
      bancoId: opts.bancoId,
      pessoaDivisaoId: opts.pessoaDivisaoId,
      pessoaPagouId: opts.pessoaPagouId,
      householdId,
      hashImportacao: hash,
    });
  }

  const resultado = await prisma.lancamento.createMany({
    data: dados,
    skipDuplicates: true,
  });

  return {
    ok: true,
    criados: resultado.count,
    duplicadosIgnorados: dados.length - resultado.count,
  };
}
