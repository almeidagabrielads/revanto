import { describe, expect, it } from "vitest";
import {
  calcularPlanejadoVsReal,
  calcularResumoPorCategoria,
  calcularResumoPorSubcategoria,
  calcularSaldo,
  type LancamentoParaRelatorio,
  type OrcamentoParaRelatorio,
  type ReceitaParaRelatorio,
} from "./relatorios";

// Cenário fixo, calculado manualmente:
// - Moradia/Aluguel: orçamento de jan explícito (1500) + orçamento anual de
//   12000 (rateado em 1000/mês para os demais meses).
// - Mercado (sem subcategoria): só orçamento anual de 6000 (rateado em 500/mês).
// - Lançamentos em jan/fev/mar/2026; valores em centavos.
const CATEGORIA_MORADIA = "cat-moradia";
const SUBCATEGORIA_ALUGUEL = "sub-aluguel";
const CATEGORIA_MERCADO = "cat-mercado";

const orcamentos: OrcamentoParaRelatorio[] = [
  {
    categoriaId: CATEGORIA_MORADIA,
    subcategoriaId: SUBCATEGORIA_ALUGUEL,
    mes: 1,
    ano: 2026,
    valorCentavos: 150_000,
  },
  {
    categoriaId: CATEGORIA_MORADIA,
    subcategoriaId: SUBCATEGORIA_ALUGUEL,
    mes: null,
    ano: 2026,
    valorCentavos: 1_200_000,
  },
  {
    categoriaId: CATEGORIA_MERCADO,
    subcategoriaId: null,
    mes: null,
    ano: 2026,
    valorCentavos: 600_000,
  },
];

function data(ano: number, mes: number, dia = 15): Date {
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const lancamentos: LancamentoParaRelatorio[] = [
  // Jan: Aluguel 1400 (dentro dos 1500 planejados para jan)
  {
    categoriaId: CATEGORIA_MORADIA,
    subcategoriaId: SUBCATEGORIA_ALUGUEL,
    data: data(2026, 1),
    valorCentavos: 140_000,
    descontoCentavos: 0,
  },
  // Fev: Aluguel 1200 com desconto de 100 -> líquido 1100 (fora do rateio de 1000)
  {
    categoriaId: CATEGORIA_MORADIA,
    subcategoriaId: SUBCATEGORIA_ALUGUEL,
    data: data(2026, 2),
    valorCentavos: 120_000,
    descontoCentavos: 10_000,
  },
  // Mar: estorno de 200 (valor negativo, RF05) -> dentro do planejado
  {
    categoriaId: CATEGORIA_MORADIA,
    subcategoriaId: SUBCATEGORIA_ALUGUEL,
    data: data(2026, 3),
    valorCentavos: -20_000,
    descontoCentavos: 0,
  },
  // Jan: Mercado 450 (dentro do rateio de 500)
  {
    categoriaId: CATEGORIA_MERCADO,
    subcategoriaId: null,
    data: data(2026, 1),
    valorCentavos: 45_000,
    descontoCentavos: 0,
  },
  // Fev: Mercado 600 (fora do rateio de 500)
  {
    categoriaId: CATEGORIA_MERCADO,
    subcategoriaId: null,
    data: data(2026, 2),
    valorCentavos: 60_000,
    descontoCentavos: 0,
  },
];

describe("calcularPlanejadoVsReal", () => {
  const resultado = calcularPlanejadoVsReal(2026, orcamentos, lancamentos);

  function linhaDe(categoriaId: string, subcategoriaId: string | null) {
    const linha = resultado.find(
      (r) =>
        r.categoriaId === categoriaId && r.subcategoriaId === subcategoriaId,
    );
    if (!linha) throw new Error("linha não encontrada");
    return linha;
  }

  it("usa o orçamento específico do mês quando existe (jan/Aluguel)", () => {
    const [jan] = linhaDe(CATEGORIA_MORADIA, SUBCATEGORIA_ALUGUEL).meses;
    expect(jan).toMatchObject({
      mes: 1,
      planejadoCentavos: 150_000,
      realCentavos: 140_000,
      diferencaCentavos: 10_000,
      dentroDoPlanejado: true,
    });
    expect(jan.percentual).toBeCloseTo((140_000 / 150_000) * 100);
  });

  it("rateia o orçamento anual pelos 12 meses quando não há orçamento mensal (fev/Aluguel)", () => {
    const fev = linhaDe(CATEGORIA_MORADIA, SUBCATEGORIA_ALUGUEL).meses[1];
    expect(fev).toMatchObject({
      mes: 2,
      planejadoCentavos: 100_000, // 1_200_000 / 12
      realCentavos: 110_000, // 120_000 - desconto de 10_000
      diferencaCentavos: -10_000,
      dentroDoPlanejado: false,
    });
    expect(fev.percentual).toBeCloseTo(110);
  });

  it("considera estornos (valores negativos) no real do mês (mar/Aluguel)", () => {
    const mar = linhaDe(CATEGORIA_MORADIA, SUBCATEGORIA_ALUGUEL).meses[2];
    expect(mar.realCentavos).toBe(-20_000);
    expect(mar.dentroDoPlanejado).toBe(true);
  });

  it("acumula planejado e real do ano inteiro (Aluguel)", () => {
    const { acumulado } = linhaDe(CATEGORIA_MORADIA, SUBCATEGORIA_ALUGUEL);
    // 150_000 (jan) + 100_000 * 11 (demais meses rateados)
    expect(acumulado.planejadoCentavos).toBe(1_250_000);
    // 140_000 + 110_000 - 20_000
    expect(acumulado.realCentavos).toBe(230_000);
    expect(acumulado.dentroDoPlanejado).toBe(true);
  });

  it("calcula categoria sem subcategoria (Mercado) mês a mês e acumulado", () => {
    const mercado = linhaDe(CATEGORIA_MERCADO, null);
    expect(mercado.meses[0]).toMatchObject({
      planejadoCentavos: 50_000,
      realCentavos: 45_000,
      dentroDoPlanejado: true,
    });
    expect(mercado.meses[1]).toMatchObject({
      planejadoCentavos: 50_000,
      realCentavos: 60_000,
      dentroDoPlanejado: false,
    });
    expect(mercado.acumulado.planejadoCentavos).toBe(600_000);
    expect(mercado.acumulado.realCentavos).toBe(105_000);
  });

  it("trata planejado zero e real zero como dentro do planejado (0%)", () => {
    const semDados = calcularPlanejadoVsReal(
      2026,
      [],
      [
        {
          categoriaId: "outra",
          subcategoriaId: null,
          data: data(2026, 1),
          valorCentavos: 0,
          descontoCentavos: 0,
        },
      ],
    );
    const [linha] = semDados;
    expect(linha.meses[0].percentual).toBe(0);
    expect(linha.meses[0].dentroDoPlanejado).toBe(true);
  });
});

describe("calcularResumoPorCategoria", () => {
  const resumo = calcularResumoPorCategoria(lancamentos);

  it("soma o total líquido por categoria, incluindo estornos", () => {
    const moradia = resumo.find((r) => r.categoriaId === CATEGORIA_MORADIA)!;
    // 140_000 + 110_000 - 20_000
    expect(moradia.totalCentavos).toBe(230_000);

    const mercado = resumo.find((r) => r.categoriaId === CATEGORIA_MERCADO)!;
    expect(mercado.totalCentavos).toBe(105_000);
  });

  it("calcula o percentual do total geral", () => {
    const moradia = resumo.find((r) => r.categoriaId === CATEGORIA_MORADIA)!;
    const mercado = resumo.find((r) => r.categoriaId === CATEGORIA_MERCADO)!;
    // total geral = 230_000 + 105_000 = 335_000
    expect(moradia.percentualDoTotal).toBeCloseTo((230_000 / 335_000) * 100);
    expect(mercado.percentualDoTotal).toBeCloseTo((105_000 / 335_000) * 100);
  });

  it("calcula a média mensal (total / 12)", () => {
    const moradia = resumo.find((r) => r.categoriaId === CATEGORIA_MORADIA)!;
    expect(moradia.mediaMensalCentavos).toBeCloseTo(230_000 / 12);
  });

  it("monta o breakdown mês a mês", () => {
    const moradia = resumo.find((r) => r.categoriaId === CATEGORIA_MORADIA)!;
    expect(moradia.porMes[1]).toBe(140_000);
    expect(moradia.porMes[2]).toBe(110_000);
    expect(moradia.porMes[3]).toBe(-20_000);
    expect(moradia.porMes[4]).toBe(0);
  });
});

describe("calcularResumoPorSubcategoria", () => {
  it("agrupa apenas lançamentos com subcategoria definida", () => {
    const resumo = calcularResumoPorSubcategoria(lancamentos);
    expect(resumo).toHaveLength(1);
    expect(resumo[0]).toMatchObject({
      categoriaId: CATEGORIA_MORADIA,
      subcategoriaId: SUBCATEGORIA_ALUGUEL,
      totalCentavos: 230_000,
      percentualDoTotal: 100,
    });
  });
});

describe("calcularSaldo", () => {
  const receitas: ReceitaParaRelatorio[] = [
    { valorCentavos: 500_000, mes: data(2026, 1, 1) },
    { valorCentavos: 500_000, mes: data(2026, 2, 1) },
  ];

  it("calcula saldo mensal (receita - despesa) considerando todos os lançamentos", () => {
    const saldo = calcularSaldo(2026, receitas, lancamentos);

    // jan: 500_000 receita - (140_000 + 45_000) despesa
    expect(saldo.porMes[0]).toMatchObject({
      mes: 1,
      receitaCentavos: 500_000,
      despesaCentavos: 185_000,
      saldoCentavos: 315_000,
    });

    // fev: 500_000 receita - (110_000 + 60_000) despesa
    expect(saldo.porMes[1]).toMatchObject({
      mes: 2,
      receitaCentavos: 500_000,
      despesaCentavos: 170_000,
      saldoCentavos: 330_000,
    });

    // mar: sem receita, despesa líquida negativa (estorno) -> saldo positivo
    expect(saldo.porMes[2]).toMatchObject({
      mes: 3,
      receitaCentavos: 0,
      despesaCentavos: -20_000,
      saldoCentavos: 20_000,
    });
  });

  it("acumula saldo anual", () => {
    const saldo = calcularSaldo(2026, receitas, lancamentos);
    expect(saldo.receitaCentavos).toBe(1_000_000);
    // 230_000 (moradia) + 105_000 (mercado)
    expect(saldo.despesaCentavos).toBe(335_000);
    expect(saldo.saldoCentavos).toBe(665_000);
  });

  it("ignora receitas e lançamentos de outros anos", () => {
    const saldo = calcularSaldo(2025, receitas, lancamentos);
    expect(saldo.receitaCentavos).toBe(0);
    expect(saldo.despesaCentavos).toBe(0);
  });
});
