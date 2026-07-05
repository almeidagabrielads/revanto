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
  // null = orçamento compartilhado pela casa (sem pessoa específica).
  pessoaId: string | null;
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

export async function buscarRelatorioAnual(
  prisma: PrismaClient,
  householdId: string,
  opts: { ano: number },
): Promise<RelatorioAnual> {
  const { ano } = opts;

  const pessoasIndividuais = await prisma.pessoa.findMany({
    where: { householdId, tipo: "INDIVIDUAL" },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  const [
    saldo,
    planejadoVsRealFamilia,
    planejadoVsRealPorPessoa,
    resumoPorCategoria,
    resumoPorSubcategoria,
    evolucaoPatrimonio,
    divisaoDespesas,
  ] = await Promise.all([
    buscarSaldo(prisma, householdId, { ano }),
    buscarPlanejadoVsReal(prisma, householdId, { ano, pessoaId: null }),
    Promise.all(
      pessoasIndividuais.map((pessoa) =>
        buscarPlanejadoVsReal(prisma, householdId, {
          ano,
          pessoaId: pessoa.id,
        }),
      ),
    ),
    buscarResumoPorCategoria(prisma, householdId, { ano }),
    buscarResumoPorSubcategoria(prisma, householdId, { ano }),
    buscarEvolucaoPatrimonioTotal(prisma, householdId, ano),
    buscarSaldoDivisaoGrupo(prisma, householdId, {
      dataInicio: new Date(Date.UTC(ano, 0, 1)),
      dataFim: new Date(Date.UTC(ano, 11, 31)),
    }),
  ]);

  const planejadoVsReal: SecaoPlanejadoVsReal[] = [
    ...pessoasIndividuais.map((pessoa, i) => ({
      pessoaId: pessoa.id,
      label: pessoa.nome,
      itens: planejadoVsRealPorPessoa[i],
    })),
    {
      pessoaId: null,
      label: "Compartilhado",
      itens: planejadoVsRealFamilia,
    },
  ];

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
