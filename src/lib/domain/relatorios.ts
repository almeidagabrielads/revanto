import type { PrismaClient } from "@/generated/prisma/client";
import { valorLiquidoCentavos } from "./lancamentos";

// ─── Tipos de entrada (dados já filtrados por household/pessoa/ano) ───────────

export type LancamentoParaRelatorio = {
  categoriaId: string | null;
  subcategoriaId: string | null;
  data: Date;
  valorCentavos: number;
  descontoCentavos: number;
};

export type OrcamentoParaRelatorio = {
  categoriaId: string;
  subcategoriaId: string | null;
  // 1–12; null = orçamento anual, ratear entre os 12 meses
  mes: number | null;
  ano: number;
  valorCentavos: number;
};

export type ReceitaParaRelatorio = {
  valorCentavos: number;
  mes: Date;
};

// ─── RF09: Planejado vs. real ──────────────────────────────────────────────────

export type IndicadorPlanejado = {
  planejadoCentavos: number;
  realCentavos: number;
  diferencaCentavos: number; // planejado - real (positivo = sobrou)
  // percentual do planejado já consumido; null quando não há planejado e nem gasto
  percentual: number | null;
  dentroDoPlanejado: boolean;
};

export type LinhaMensalPlanejadoReal = IndicadorPlanejado & { mes: number };

export type PlanejadoVsRealCategoria = {
  categoriaId: string;
  subcategoriaId: string | null;
  meses: LinhaMensalPlanejadoReal[]; // 12 entradas, mes 1..12
  acumulado: IndicadorPlanejado;
};

function calcularIndicador(
  planejadoCentavos: number,
  realCentavos: number,
): IndicadorPlanejado {
  const percentual =
    planejadoCentavos === 0
      ? realCentavos === 0
        ? 0
        : null
      : (realCentavos / planejadoCentavos) * 100;

  const dentroDoPlanejado =
    planejadoCentavos === 0
      ? realCentavos <= 0
      : realCentavos <= planejadoCentavos;

  return {
    planejadoCentavos,
    realCentavos,
    diferencaCentavos: planejadoCentavos - realCentavos,
    percentual,
    dentroDoPlanejado,
  };
}

function chaveCategoria(categoriaId: string, subcategoriaId: string | null) {
  return `${categoriaId}::${subcategoriaId ?? ""}`;
}

export function calcularPlanejadoVsReal(
  ano: number,
  orcamentos: OrcamentoParaRelatorio[],
  lancamentos: LancamentoParaRelatorio[],
): PlanejadoVsRealCategoria[] {
  const orcamentosDoAno = orcamentos.filter((o) => o.ano === ano);
  const lancamentosDoAno = lancamentos.filter(
    (l) => l.data.getUTCFullYear() === ano && l.categoriaId,
  );

  const chaves = new Map<
    string,
    { categoriaId: string; subcategoriaId: string | null }
  >();
  for (const o of orcamentosDoAno) {
    chaves.set(chaveCategoria(o.categoriaId, o.subcategoriaId), {
      categoriaId: o.categoriaId,
      subcategoriaId: o.subcategoriaId,
    });
  }
  for (const l of lancamentosDoAno) {
    chaves.set(chaveCategoria(l.categoriaId!, l.subcategoriaId), {
      categoriaId: l.categoriaId!,
      subcategoriaId: l.subcategoriaId,
    });
  }

  return Array.from(chaves.values()).map(({ categoriaId, subcategoriaId }) => {
    const orcamentosDaChave = orcamentosDoAno.filter(
      (o) =>
        o.categoriaId === categoriaId && o.subcategoriaId === subcategoriaId,
    );
    const anualCentavos = orcamentosDaChave
      .filter((o) => o.mes === null)
      .reduce((soma, o) => soma + o.valorCentavos, 0);
    // Orçamento anual (sem mês definido) é rateado igualmente pelos 12 meses.
    const planejadoRateado = Math.round(anualCentavos / 12);

    const lancamentosDaChave = lancamentosDoAno.filter(
      (l) =>
        l.categoriaId === categoriaId && l.subcategoriaId === subcategoriaId,
    );

    const meses: LinhaMensalPlanejadoReal[] = Array.from(
      { length: 12 },
      (_, i) => {
        const mes = i + 1;
        const planejadoMes = orcamentosDaChave
          .filter((o) => o.mes === mes)
          .reduce((soma, o) => soma + o.valorCentavos, 0);
        const planejadoCentavos =
          planejadoMes > 0 ? planejadoMes : planejadoRateado;

        const realCentavos = lancamentosDaChave
          .filter((l) => l.data.getUTCMonth() + 1 === mes)
          .reduce((soma, l) => soma + valorLiquidoCentavos(l), 0);

        return { mes, ...calcularIndicador(planejadoCentavos, realCentavos) };
      },
    );

    const planejadoAcumulado = meses.reduce(
      (soma, m) => soma + m.planejadoCentavos,
      0,
    );
    const realAcumulado = meses.reduce((soma, m) => soma + m.realCentavos, 0);

    return {
      categoriaId,
      subcategoriaId,
      meses,
      acumulado: calcularIndicador(planejadoAcumulado, realAcumulado),
    };
  });
}

export async function buscarPlanejadoVsReal(
  prisma: PrismaClient,
  householdId: string,
  opts: { ano: number; pessoaId?: string | null },
): Promise<PlanejadoVsRealCategoria[]> {
  const [orcamentos, lancamentos] = await Promise.all([
    prisma.orcamentoPlanejado.findMany({
      where: {
        householdId,
        ano: opts.ano,
        ...(opts.pessoaId !== undefined ? { pessoaId: opts.pessoaId } : {}),
      },
      select: {
        categoriaId: true,
        subcategoriaId: true,
        mes: true,
        ano: true,
        valorCentavos: true,
      },
    }),
    prisma.lancamento.findMany({
      where: {
        householdId,
        data: {
          gte: new Date(Date.UTC(opts.ano, 0, 1)),
          lt: new Date(Date.UTC(opts.ano + 1, 0, 1)),
        },
        ...(opts.pessoaId ? { pessoaDivisaoId: opts.pessoaId } : {}),
      },
      select: {
        categoriaId: true,
        subcategoriaId: true,
        data: true,
        valorCentavos: true,
        descontoCentavos: true,
      },
    }),
  ]);

  return calcularPlanejadoVsReal(opts.ano, orcamentos, lancamentos);
}

// ─── RF10: Relatórios agregados por categoria/subcategoria ─────────────────────

export type ResumoAgregado = {
  totalCentavos: number;
  percentualDoTotal: number; // 0-100
  mediaMensalCentavos: number; // total do ano / 12
  porMes: Record<number, number>; // mes(1-12) -> total em centavos
};

export type ResumoCategoria = ResumoAgregado & { categoriaId: string };
export type ResumoSubcategoria = ResumoAgregado & {
  categoriaId: string;
  subcategoriaId: string;
};

function mesesVazios(): Record<number, number> {
  return Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 0]));
}

export function calcularResumoPorCategoria(
  lancamentos: LancamentoParaRelatorio[],
): ResumoCategoria[] {
  const porCategoria = new Map<string, Record<number, number>>();
  for (const l of lancamentos) {
    if (!l.categoriaId) continue;
    const mes = l.data.getUTCMonth() + 1;
    const acumulador = porCategoria.get(l.categoriaId) ?? mesesVazios();
    acumulador[mes] += valorLiquidoCentavos(l);
    porCategoria.set(l.categoriaId, acumulador);
  }

  const totalGeral = Array.from(porCategoria.values()).reduce(
    (soma, porMes) => soma + Object.values(porMes).reduce((s, v) => s + v, 0),
    0,
  );

  return Array.from(porCategoria.entries()).map(([categoriaId, porMes]) => {
    const totalCentavos = Object.values(porMes).reduce((s, v) => s + v, 0);
    return {
      categoriaId,
      totalCentavos,
      percentualDoTotal:
        totalGeral === 0 ? 0 : (totalCentavos / totalGeral) * 100,
      mediaMensalCentavos: totalCentavos / 12,
      porMes,
    };
  });
}

export function calcularResumoPorSubcategoria(
  lancamentos: LancamentoParaRelatorio[],
): ResumoSubcategoria[] {
  const porSubcategoria = new Map<
    string,
    {
      categoriaId: string;
      subcategoriaId: string;
      porMes: Record<number, number>;
    }
  >();
  for (const l of lancamentos) {
    if (!l.categoriaId || !l.subcategoriaId) continue;
    const chave = chaveCategoria(l.categoriaId, l.subcategoriaId);
    const mes = l.data.getUTCMonth() + 1;
    const entrada = porSubcategoria.get(chave) ?? {
      categoriaId: l.categoriaId,
      subcategoriaId: l.subcategoriaId,
      porMes: mesesVazios(),
    };
    entrada.porMes[mes] += valorLiquidoCentavos(l);
    porSubcategoria.set(chave, entrada);
  }

  const totalGeral = Array.from(porSubcategoria.values()).reduce(
    (soma, { porMes }) =>
      soma + Object.values(porMes).reduce((s, v) => s + v, 0),
    0,
  );

  return Array.from(porSubcategoria.values()).map(
    ({ categoriaId, subcategoriaId, porMes }) => {
      const totalCentavos = Object.values(porMes).reduce((s, v) => s + v, 0);
      return {
        categoriaId,
        subcategoriaId,
        totalCentavos,
        percentualDoTotal:
          totalGeral === 0 ? 0 : (totalCentavos / totalGeral) * 100,
        mediaMensalCentavos: totalCentavos / 12,
        porMes,
      };
    },
  );
}

export async function buscarResumoPorCategoria(
  prisma: PrismaClient,
  householdId: string,
  opts: { ano: number; pessoaId?: string },
): Promise<ResumoCategoria[]> {
  const lancamentos = await buscarLancamentosDoAno(prisma, householdId, opts);
  return calcularResumoPorCategoria(lancamentos);
}

export async function buscarResumoPorSubcategoria(
  prisma: PrismaClient,
  householdId: string,
  opts: { ano: number; pessoaId?: string },
): Promise<ResumoSubcategoria[]> {
  const lancamentos = await buscarLancamentosDoAno(prisma, householdId, opts);
  return calcularResumoPorSubcategoria(lancamentos);
}

async function buscarLancamentosDoAno(
  prisma: PrismaClient,
  householdId: string,
  opts: { ano: number; pessoaId?: string },
): Promise<LancamentoParaRelatorio[]> {
  return prisma.lancamento.findMany({
    where: {
      householdId,
      data: {
        gte: new Date(Date.UTC(opts.ano, 0, 1)),
        lt: new Date(Date.UTC(opts.ano + 1, 0, 1)),
      },
      ...(opts.pessoaId ? { pessoaDivisaoId: opts.pessoaId } : {}),
    },
    select: {
      categoriaId: true,
      subcategoriaId: true,
      data: true,
      valorCentavos: true,
      descontoCentavos: true,
    },
  });
}

// ─── Saldo mensal/anual (receita total - despesa total) ────────────────────────

export type SaldoMensal = {
  mes: number;
  receitaCentavos: number;
  despesaCentavos: number;
  saldoCentavos: number;
};

export type SaldoAnual = {
  ano: number;
  receitaCentavos: number;
  despesaCentavos: number;
  saldoCentavos: number;
  porMes: SaldoMensal[]; // 12 entradas, mes 1..12
};

export function calcularSaldo(
  ano: number,
  receitas: ReceitaParaRelatorio[],
  lancamentos: LancamentoParaRelatorio[],
): SaldoAnual {
  const receitasDoAno = receitas.filter((r) => r.mes.getUTCFullYear() === ano);
  const lancamentosDoAno = lancamentos.filter(
    (l) => l.data.getUTCFullYear() === ano,
  );

  const porMes: SaldoMensal[] = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const receitaCentavos = receitasDoAno
      .filter((r) => r.mes.getUTCMonth() + 1 === mes)
      .reduce((soma, r) => soma + r.valorCentavos, 0);
    const despesaCentavos = lancamentosDoAno
      .filter((l) => l.data.getUTCMonth() + 1 === mes)
      .reduce((soma, l) => soma + valorLiquidoCentavos(l), 0);
    return {
      mes,
      receitaCentavos,
      despesaCentavos,
      saldoCentavos: receitaCentavos - despesaCentavos,
    };
  });

  const receitaCentavos = porMes.reduce((s, m) => s + m.receitaCentavos, 0);
  const despesaCentavos = porMes.reduce((s, m) => s + m.despesaCentavos, 0);

  return {
    ano,
    receitaCentavos,
    despesaCentavos,
    saldoCentavos: receitaCentavos - despesaCentavos,
    porMes,
  };
}

export async function buscarSaldo(
  prisma: PrismaClient,
  householdId: string,
  opts: { ano: number; pessoaId?: string },
): Promise<SaldoAnual> {
  const [receitas, lancamentos] = await Promise.all([
    prisma.receita.findMany({
      where: {
        householdId,
        mes: {
          gte: new Date(Date.UTC(opts.ano, 0, 1)),
          lt: new Date(Date.UTC(opts.ano + 1, 0, 1)),
        },
        ...(opts.pessoaId ? { pessoaId: opts.pessoaId } : {}),
      },
      select: { valorCentavos: true, mes: true },
    }),
    buscarLancamentosDoAno(prisma, householdId, opts),
  ]);

  return calcularSaldo(opts.ano, receitas, lancamentos);
}
