import type { PrismaClient } from "@/generated/prisma/client";
import {
  buscarPlanejadoVsReal,
  buscarResumoPorCategoria,
  buscarResumoPorSubcategoria,
  buscarSaldo,
  type PlanejadoVsRealCategoria,
  type ResumoCategoria,
  type ResumoSubcategoria,
  type SaldoAnual,
} from "./relatorios";
import { buscarSaldoDivisaoGrupo, type SaldoDivisaoGrupo } from "./split";

// ─── Relatório anual consolidado ───────────────────────────────────────────────
//
// Reúne, em uma única leitura, o que hoje está espalhado entre as abas "Anual",
// "Sum (Categoria)" e "Sum (Subcategoria)" da planilha original: orçamento
// planejado vs. real do ano por pessoa/família, saldo final do ano, evolução
// de patrimônio total e divisão de despesas acumulada do ano.

export type PosicaoMensalTotal = {
  // Sempre o 1º dia do mês em UTC.
  mes: Date;
  valorCentavos: number;
};

/**
 * Agrega posições de patrimônio (de todos os bancos/titulares) por mês,
 * somando os valores lançados em cada mês. Meses sem nenhum lançamento não
 * aparecem no resultado (não são assumidos como zero).
 */
export function calcularEvolucaoPatrimonio(
  posicoes: PosicaoMensalTotal[],
): PosicaoMensalTotal[] {
  const porMes = new Map<string, PosicaoMensalTotal>();
  for (const p of posicoes) {
    const mesNormalizado = new Date(
      Date.UTC(p.mes.getUTCFullYear(), p.mes.getUTCMonth(), 1),
    );
    const chave = `${mesNormalizado.getUTCFullYear()}-${mesNormalizado.getUTCMonth()}`;
    const acumulado = porMes.get(chave) ?? {
      mes: mesNormalizado,
      valorCentavos: 0,
    };
    acumulado.valorCentavos += p.valorCentavos;
    porMes.set(chave, acumulado);
  }

  return Array.from(porMes.values()).sort(
    (a, b) => a.mes.getTime() - b.mes.getTime(),
  );
}

export type SecaoPlanejadoVsReal = {
  pessoaId: string;
  // Tipo da Pessoa (INDIVIDUAL, CASAL, FAMILIA, OUTRO) — usado pelo
  // consumidor (DashboardAnual) para não somar duas vezes o gasto/orçamento
  // de um grupo e de seus integrantes na visão "Geral".
  tipo: string;
  label: string;
  itens: PlanejadoVsRealCategoria[];
};

export type RelatorioAnual = {
  ano: number;
  saldo: SaldoAnual;
  planejadoVsReal: SecaoPlanejadoVsReal[];
  resumoPorCategoria: ResumoCategoria[];
  resumoPorSubcategoria: ResumoSubcategoria[];
  evolucaoPatrimonio: PosicaoMensalTotal[];
  divisaoDespesas: SaldoDivisaoGrupo | null;
};

export async function buscarEvolucaoPatrimonioTotal(
  prisma: PrismaClient,
  householdId: string,
  ano: number,
): Promise<PosicaoMensalTotal[]> {
  const posicoes = await prisma.posicaoPatrimonio.findMany({
    where: {
      householdId,
      mes: {
        gte: new Date(Date.UTC(ano, 0, 1)),
        lte: new Date(Date.UTC(ano, 11, 1)),
      },
    },
    select: { mes: true, valorCentavos: true },
  });

  return calcularEvolucaoPatrimonio(posicoes);
}

// Sem pessoaId (visão "Geral"): uma seção por pessoa individual + uma por
// grupo (CASAL/FAMILIA/OUTRO) — o orçamento do grupo é a soma do que cada
// integrante planejou (ver buscarPlanejadoVsReal), não um valor à parte.
// Com pessoaId (pessoa individual ou grupo): uma única seção com a visão
// daquele responsável, já com a mesma fração de gastos de grupo usada em
// buscarSaldo/buscarResumoPorCategoria (ver resolverFracaoPorGrupo em
// pessoas.ts) — filtrar por uma pessoa individual soma só a parte dela dos
// gastos do grupo; filtrar por um grupo traz o valor cheio dele.
async function buscarSecoesPlanejadoVsReal(
  prisma: PrismaClient,
  householdId: string,
  opts: { ano: number; pessoaId: string | null },
): Promise<SecaoPlanejadoVsReal[]> {
  if (opts.pessoaId) {
    const [pessoa, itens] = await Promise.all([
      prisma.pessoa.findFirst({
        where: { id: opts.pessoaId, householdId },
        select: { nome: true, tipo: true },
      }),
      buscarPlanejadoVsReal(prisma, householdId, {
        ano: opts.ano,
        pessoaId: opts.pessoaId,
      }),
    ]);
    return [
      {
        pessoaId: opts.pessoaId,
        tipo: pessoa?.tipo ?? "INDIVIDUAL",
        label: pessoa?.nome ?? "—",
        itens,
      },
    ];
  }

  const pessoas = await prisma.pessoa.findMany({
    where: { householdId },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, tipo: true },
  });

  const planejadoVsRealPorPessoa = await Promise.all(
    pessoas.map((pessoa) =>
      buscarPlanejadoVsReal(prisma, householdId, {
        ano: opts.ano,
        pessoaId: pessoa.id,
      }),
    ),
  );

  return pessoas.map((pessoa, i) => ({
    pessoaId: pessoa.id,
    tipo: pessoa.tipo,
    label: pessoa.nome,
    itens: planejadoVsRealPorPessoa[i],
  }));
}

export async function buscarRelatorioAnual(
  prisma: PrismaClient,
  householdId: string,
  opts: { ano: number; pessoaId?: string | null },
): Promise<RelatorioAnual> {
  const { ano } = opts;
  const pessoaId = opts.pessoaId ?? null;

  const [
    saldo,
    planejadoVsReal,
    resumoPorCategoria,
    resumoPorSubcategoria,
    evolucaoPatrimonio,
    divisaoDespesas,
  ] = await Promise.all([
    buscarSaldo(prisma, householdId, { ano, pessoaId: pessoaId ?? undefined }),
    buscarSecoesPlanejadoVsReal(prisma, householdId, { ano, pessoaId }),
    buscarResumoPorCategoria(prisma, householdId, {
      ano,
      pessoaId: pessoaId ?? undefined,
    }),
    buscarResumoPorSubcategoria(prisma, householdId, {
      ano,
      pessoaId: pessoaId ?? undefined,
    }),
    buscarEvolucaoPatrimonioTotal(prisma, householdId, ano),
    buscarSaldoDivisaoGrupo(prisma, householdId, {
      dataInicio: new Date(Date.UTC(ano, 0, 1)),
      dataFim: new Date(Date.UTC(ano, 11, 31)),
    }),
  ]);

  return {
    ano,
    saldo,
    planejadoVsReal,
    resumoPorCategoria,
    resumoPorSubcategoria,
    evolucaoPatrimonio,
    divisaoDespesas,
  };
}
