import type { PrismaClient } from "@/generated/prisma/client";
import { obterCdiMensal } from "./cdi";

// ─── RF14: Rendimento real vs. esperado vs. CDI, projeção de patrimônio ───────

export type PosicaoMensal = {
  // Sempre o 1º dia do mês em UTC.
  mes: Date;
  valorCentavos: number;
};

export type CdiDoMes = {
  mes: Date;
  // % ao mês, ex.: 0.96 = 0.96%
  percentual: number;
};

export type LinhaRendimento = {
  mes: Date;
  posicaoCentavos: number;
  // null no primeiro mês da série — não há posição anterior para comparar.
  variacaoCentavos: number | null;
  rendimentoMensalRealPercentual: number | null;
  rendimentoAcumuladoRealCentavos: number;
  rendimentoAcumuladoRealPercentual: number;
  cdiMensalPercentual: number | null;
  cdiAcumuladoPercentual: number;
  rendimentoMensalEsperadoCentavos: number | null;
  rendimentoAcumuladoEsperadoCentavos: number;
  diferencaRealEsperadoCentavos: number | null;
};

function chaveMes(mes: Date): string {
  return `${mes.getUTCFullYear()}-${mes.getUTCMonth()}`;
}

/**
 * Calcula, mês a mês, a variação de patrimônio real, o rendimento esperado
 * (a partir do CDI e do percentual de CDI contratado) e a diferença entre os
 * dois — réplica das fórmulas da aba "Histórico Patrimônio" da planilha
 * original.
 *
 * `posicoes` deve conter no máximo uma posição por mês (já agregada por
 * banco/titular) e estar ordenada cronologicamente.
 */
export function calcularRendimento(
  posicoes: PosicaoMensal[],
  cdiPorMes: CdiDoMes[],
  opts: { percentualCdiContratado?: number } = {},
): LinhaRendimento[] {
  const percentualCdiContratado = opts.percentualCdiContratado ?? 100;
  const cdiPorChave = new Map(
    cdiPorMes.map((c) => [chaveMes(c.mes), c.percentual]),
  );

  let rendimentoAcumuladoRealCentavos = 0;
  let rendimentoAcumuladoRealPercentual = 0;
  let cdiAcumuladoPercentual = 0;
  let rendimentoAcumuladoEsperadoCentavos = 0;

  return posicoes.map((posicao, i) => {
    const anterior = i > 0 ? posicoes[i - 1] : null;
    const cdiMensalPercentual = cdiPorChave.get(chaveMes(posicao.mes)) ?? null;

    const variacaoCentavos = anterior
      ? posicao.valorCentavos - anterior.valorCentavos
      : null;

    const rendimentoMensalRealPercentual =
      anterior && anterior.valorCentavos !== 0
        ? (variacaoCentavos! / anterior.valorCentavos) * 100
        : null;

    const rendimentoMensalEsperadoCentavos = anterior
      ? Math.round(
          anterior.valorCentavos *
            ((cdiMensalPercentual ?? 0) / 100) *
            (percentualCdiContratado / 100),
        )
      : null;

    const diferencaRealEsperadoCentavos =
      variacaoCentavos !== null && rendimentoMensalEsperadoCentavos !== null
        ? variacaoCentavos - rendimentoMensalEsperadoCentavos
        : null;

    if (anterior) {
      rendimentoAcumuladoRealCentavos += variacaoCentavos!;
      rendimentoAcumuladoRealPercentual += rendimentoMensalRealPercentual ?? 0;
      cdiAcumuladoPercentual += cdiMensalPercentual ?? 0;
      rendimentoAcumuladoEsperadoCentavos +=
        rendimentoMensalEsperadoCentavos ?? 0;
    }

    return {
      mes: posicao.mes,
      posicaoCentavos: posicao.valorCentavos,
      variacaoCentavos,
      rendimentoMensalRealPercentual,
      rendimentoAcumuladoRealCentavos,
      rendimentoAcumuladoRealPercentual,
      cdiMensalPercentual,
      cdiAcumuladoPercentual,
      rendimentoMensalEsperadoCentavos,
      rendimentoAcumuladoEsperadoCentavos,
      diferencaRealEsperadoCentavos,
    };
  });
}

export type ProjecaoPatrimonio = {
  mesesAFrente: number;
  valorProjetadoCentavos: number;
};

/**
 * Projeta o patrimônio futuro por juros compostos, aplicando a mesma taxa
 * mensal esperada em cada mês futuro (ex.: CDI mensal atual × % contratado).
 */
export function projetarPatrimonioFuturo(
  posicaoAtualCentavos: number,
  taxaMensalEsperadaPercentual: number,
  meses: number,
): ProjecaoPatrimonio[] {
  const taxa = taxaMensalEsperadaPercentual / 100;
  return Array.from({ length: meses }, (_, i) => {
    const mesesAFrente = i + 1;
    return {
      mesesAFrente,
      valorProjetadoCentavos: Math.round(
        posicaoAtualCentavos * Math.pow(1 + taxa, mesesAFrente),
      ),
    };
  });
}

// ─── Orquestração (busca posições + CDI e delega para o cálculo puro) ─────────

export async function buscarHistoricoRendimento(
  prisma: PrismaClient,
  householdId: string,
  opts: {
    ano: number;
    pessoaId?: string | null;
    percentualCdiContratado?: number;
  },
): Promise<LinhaRendimento[]> {
  const dataInicial = new Date(Date.UTC(opts.ano, 0, 1));
  const dataFinal = new Date(Date.UTC(opts.ano, 11, 1));

  const posicoesBrutas = await prisma.posicaoPatrimonio.findMany({
    where: {
      householdId,
      mes: { gte: dataInicial, lte: dataFinal },
      ...(opts.pessoaId !== undefined ? { pessoaId: opts.pessoaId } : {}),
    },
    select: { mes: true, valorCentavos: true },
    orderBy: { mes: "asc" },
  });

  // Agrega por mês (soma todos os bancos/titulares do período) — só entram
  // na série os meses em que de fato existe alguma posição lançada; meses
  // sem lançamento são omitidos, não assumidos como zero.
  const porMes = new Map<string, PosicaoMensal>();
  for (const p of posicoesBrutas) {
    const chave = chaveMes(p.mes);
    const mes = new Date(
      Date.UTC(p.mes.getUTCFullYear(), p.mes.getUTCMonth(), 1),
    );
    const acumulado = porMes.get(chave) ?? { mes, valorCentavos: 0 };
    acumulado.valorCentavos += p.valorCentavos;
    porMes.set(chave, acumulado);
  }
  const posicoes: PosicaoMensal[] = Array.from(porMes.values()).sort(
    (a, b) => a.mes.getTime() - b.mes.getTime(),
  );

  const cdiPorMes =
    posicoes.length > 0
      ? await obterCdiMensal(
          prisma,
          posicoes[0].mes,
          posicoes[posicoes.length - 1].mes,
        )
      : [];

  return calcularRendimento(
    posicoes,
    cdiPorMes.map((c) => ({ mes: c.mes, percentual: Number(c.percentual) })),
    { percentualCdiContratado: opts.percentualCdiContratado },
  );
}
