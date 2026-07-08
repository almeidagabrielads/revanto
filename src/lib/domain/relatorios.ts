import type { PrismaClient } from "@/generated/prisma/client";
import { buscarFechamento } from "./fechamentos";
import { valorLiquidoCentavos } from "./lancamentos";
import { resolverFracaoPorGrupo, resolverPessoasEfetivas } from "./pessoas";

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
  // 1–12: valor vigente a partir desse mês (até o próximo mês com valor
  // definido). null = legado (orçamento anual antigo), tratado como vigente
  // desde o mês 1.
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
    // Valor definido a partir de cada mês (mes=null é vigente desde o mês 1).
    // Quando há mais de uma entrada com o mesmo início, soma (ex.: várias
    // pessoas com orçamento próprio nesse mês).
    const valorPorInicio = new Map<number, number>();
    for (const o of orcamentosDaChave) {
      const inicio = o.mes ?? 1;
      valorPorInicio.set(
        inicio,
        (valorPorInicio.get(inicio) ?? 0) + o.valorCentavos,
      );
    }

    const lancamentosDaChave = lancamentosDoAno.filter(
      (l) =>
        l.categoriaId === categoriaId && l.subcategoriaId === subcategoriaId,
    );

    // O valor vigente carrega do mês em que foi definido até o próximo mês
    // com valor próprio (não é mais rateado pelos 12 meses).
    let valorVigenteCentavos = 0;
    const meses: LinhaMensalPlanejadoReal[] = Array.from(
      { length: 12 },
      (_, i) => {
        const mes = i + 1;
        if (valorPorInicio.has(mes)) {
          valorVigenteCentavos = valorPorInicio.get(mes)!;
        }

        const realCentavos = lancamentosDaChave
          .filter((l) => l.data.getUTCMonth() + 1 === mes)
          .reduce((soma, l) => soma + valorLiquidoCentavos(l), 0);

        return {
          mes,
          ...calcularIndicador(valorVigenteCentavos, realCentavos),
        };
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
  const [orcamentos, lancamentos, subcategorias] = await Promise.all([
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
    buscarLancamentosDoAno(prisma, householdId, {
      ano: opts.ano,
      pessoaId: opts.pessoaId ?? undefined,
    }),
    prisma.subcategoria.findMany({
      where: { householdId, orcamentoCentavos: { not: null } },
      select: { id: true, categoriaId: true, orcamentoCentavos: true },
    }),
  ]);

  // Limite sugerido cadastrado em Categorias & Orçamento (Subcategoria.orcamentoCentavos)
  // serve de base (vigente desde o mês 1) quando a subcategoria ainda não tem
  // nenhum valor específico definido nessa posição no orçamento mensal.
  const chavesComValorNoInicio = new Set(
    orcamentos
      .filter((o) => o.mes === 1 || o.mes === null)
      .map((o) => chaveCategoria(o.categoriaId, o.subcategoriaId)),
  );
  const orcamentosComPadrao: OrcamentoParaRelatorio[] = [...orcamentos];
  for (const sub of subcategorias) {
    if (chavesComValorNoInicio.has(chaveCategoria(sub.categoriaId, sub.id))) {
      continue;
    }
    orcamentosComPadrao.push({
      categoriaId: sub.categoriaId,
      subcategoriaId: sub.id,
      mes: null,
      ano: opts.ano,
      valorCentavos: sub.orcamentoCentavos!,
    });
  }

  return calcularPlanejadoVsReal(opts.ano, orcamentosComPadrao, lancamentos);
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

// Gastos de uma pessoa INDIVIDUAL = seus lançamentos com divisão direta nela
// + a fração que lhe cabe (ver resolverFracaoPorGrupo) dos lançamentos cuja
// divisão é um grupo (CASAL/FAMILIA) do qual ela participa. Filtrar por um
// grupo, por outro lado, traz o valor cheio dos lançamentos daquele grupo
// (sem fração — é a visão "geral" desse grupo).
async function buscarLancamentosDoAno(
  prisma: PrismaClient,
  householdId: string,
  opts: { ano: number; pessoaId?: string },
): Promise<LancamentoParaRelatorio[]> {
  const filtroData = {
    gte: new Date(Date.UTC(opts.ano, 0, 1)),
    lt: new Date(Date.UTC(opts.ano + 1, 0, 1)),
  };
  const camposSelecionados = {
    categoriaId: true,
    subcategoriaId: true,
    data: true,
    valorCentavos: true,
    descontoCentavos: true,
  } as const;

  if (!opts.pessoaId) {
    return prisma.lancamento.findMany({
      where: { householdId, data: filtroData },
      select: camposSelecionados,
    });
  }

  const fracaoPorGrupo = await resolverFracaoPorGrupo(
    prisma,
    householdId,
    opts.pessoaId,
  );

  const lancamentos = await prisma.lancamento.findMany({
    where: {
      householdId,
      data: filtroData,
      pessoaDivisaoId: { in: [opts.pessoaId, ...fracaoPorGrupo.keys()] },
    },
    select: { ...camposSelecionados, pessoaDivisaoId: true },
  });

  return lancamentos.map((l) => {
    const fracao =
      l.pessoaDivisaoId === opts.pessoaId
        ? 1
        : (fracaoPorGrupo.get(l.pessoaDivisaoId) ?? 0);
    return {
      categoriaId: l.categoriaId,
      subcategoriaId: l.subcategoriaId,
      data: l.data,
      valorCentavos: Math.round(l.valorCentavos * fracao),
      descontoCentavos: Math.round(l.descontoCentavos * fracao),
    };
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
  // Renda de um grupo (CASAL/FAMILIA) = somatório da renda de quem o compõe.
  // Despesas continuam filtradas literalmente por pessoaId (ver
  // buscarLancamentosDoAno) — o gasto de um grupo já é tratado pelo acerto de
  // contas (split.ts), não por agregação de indivíduos aqui.
  const pessoaIdsReceita = opts.pessoaId
    ? await resolverPessoasEfetivas(prisma, householdId, opts.pessoaId)
    : undefined;

  const [receitas, lancamentos] = await Promise.all([
    prisma.receita.findMany({
      where: {
        householdId,
        mes: {
          gte: new Date(Date.UTC(opts.ano, 0, 1)),
          lt: new Date(Date.UTC(opts.ano + 1, 0, 1)),
        },
        ...(pessoaIdsReceita ? { pessoaId: { in: pessoaIdsReceita } } : {}),
      },
      select: { valorCentavos: true, mes: true },
    }),
    buscarLancamentosDoAno(prisma, householdId, opts),
  ]);

  return calcularSaldo(opts.ano, receitas, lancamentos);
}

// ─── Saldo do ano anterior (para acumular com o saldo do ano corrente) ─────────

// "sistema": calculado a partir de receitas/lançamentos já registrados no ano.
// "manual": informado (ou corrigido) pelo usuário via FechamentoAnual — usado
// quando o ano anterior não tem nenhum registro no sistema, ou quando o
// usuário optou por sobrescrever o valor calculado automaticamente.
export type SaldoAnoAnterior = {
  origem: "sistema" | "manual";
  saldoCentavos: number;
} | null;

export async function buscarSaldoAnoAnterior(
  prisma: PrismaClient,
  householdId: string,
  ano: number,
): Promise<SaldoAnoAnterior> {
  const anoAnterior = ano - 1;

  const fechamento = await buscarFechamento(prisma, householdId, anoAnterior);
  if (fechamento) {
    return { origem: "manual", saldoCentavos: fechamento.saldoCentavos };
  }

  const saldo = await buscarSaldo(prisma, householdId, { ano: anoAnterior });
  if (saldo.receitaCentavos !== 0 || saldo.despesaCentavos !== 0) {
    return { origem: "sistema", saldoCentavos: saldo.saldoCentavos };
  }

  return null;
}
