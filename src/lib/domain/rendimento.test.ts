import { describe, expect, it } from "vitest";
import {
  calcularRendimento,
  projetarPatrimonioFuturo,
  type CdiDoMes,
  type PosicaoMensal,
} from "./rendimento";

function mes(ano: number, mesIndex1a12: number): Date {
  return new Date(Date.UTC(ano, mesIndex1a12 - 1, 1));
}

describe("calcularRendimento", () => {
  const posicoes: PosicaoMensal[] = [
    { mes: mes(2026, 1), valorCentavos: 1_000_000 },
    { mes: mes(2026, 2), valorCentavos: 1_050_000 },
    { mes: mes(2026, 3), valorCentavos: 1_102_500 },
  ];

  const cdi: CdiDoMes[] = [
    { mes: mes(2026, 1), percentual: 1 },
    { mes: mes(2026, 2), percentual: 1 },
    { mes: mes(2026, 3), percentual: 1 },
  ];

  it("primeiro mês da série não tem variação nem comparação (sem base anterior)", () => {
    const [jan] = calcularRendimento(posicoes, cdi);

    expect(jan.posicaoCentavos).toBe(1_000_000);
    expect(jan.variacaoCentavos).toBeNull();
    expect(jan.rendimentoMensalRealPercentual).toBeNull();
    expect(jan.rendimentoMensalEsperadoCentavos).toBeNull();
    expect(jan.diferencaRealEsperadoCentavos).toBeNull();
    expect(jan.rendimentoAcumuladoRealCentavos).toBe(0);
    expect(jan.rendimentoAcumuladoRealPercentual).toBe(0);
    expect(jan.cdiAcumuladoPercentual).toBe(0);
  });

  it("calcula variação de patrimônio mês a mês", () => {
    const [, fev, mar] = calcularRendimento(posicoes, cdi);

    expect(fev.variacaoCentavos).toBe(50_000);
    expect(mar.variacaoCentavos).toBe(52_500);
  });

  it("calcula rendimento mensal real (%) a partir da posição anterior", () => {
    const [, fev, mar] = calcularRendimento(posicoes, cdi);

    expect(fev.rendimentoMensalRealPercentual).toBeCloseTo(5, 6);
    expect(mar.rendimentoMensalRealPercentual).toBeCloseTo(5, 6);
  });

  it("acumula rendimento real (R$ e %) mês a mês", () => {
    const [, fev, mar] = calcularRendimento(posicoes, cdi);

    expect(fev.rendimentoAcumuladoRealCentavos).toBe(50_000);
    expect(mar.rendimentoAcumuladoRealCentavos).toBe(102_500);

    expect(fev.rendimentoAcumuladoRealPercentual).toBeCloseTo(5, 6);
    expect(mar.rendimentoAcumuladoRealPercentual).toBeCloseTo(10, 6);
  });

  it("calcula rendimento mensal esperado a partir da posição anterior × CDI do mês (100% do CDI)", () => {
    const [, fev, mar] = calcularRendimento(posicoes, cdi, {
      percentualCdiContratado: 100,
    });

    // esperado(Fev) = posição(Jan) × CDI(Fev) = 1_000_000 × 1% = 10_000
    expect(fev.rendimentoMensalEsperadoCentavos).toBe(10_000);
    // esperado(Mar) = posição(Fev) × CDI(Mar) = 1_050_000 × 1% = 10_500
    expect(mar.rendimentoMensalEsperadoCentavos).toBe(10_500);
  });

  it("aplica o percentual de CDI contratado ao rendimento esperado (ex.: 77,5% do CDI líquido)", () => {
    const [, fev] = calcularRendimento(posicoes, cdi, {
      percentualCdiContratado: 77.5,
    });

    // 1_000_000 × 1% × 77,5% = 7_750
    expect(fev.rendimentoMensalEsperadoCentavos).toBe(7_750);
  });

  it("calcula a diferença entre o real e o esperado", () => {
    const [, fev, mar] = calcularRendimento(posicoes, cdi, {
      percentualCdiContratado: 100,
    });

    expect(fev.diferencaRealEsperadoCentavos).toBe(50_000 - 10_000);
    expect(mar.diferencaRealEsperadoCentavos).toBe(52_500 - 10_500);
  });

  it("acumula o CDI e o rendimento esperado mês a mês", () => {
    const [, fev, mar] = calcularRendimento(posicoes, cdi, {
      percentualCdiContratado: 100,
    });

    expect(fev.cdiAcumuladoPercentual).toBeCloseTo(1, 6);
    expect(mar.cdiAcumuladoPercentual).toBeCloseTo(2, 6);

    expect(fev.rendimentoAcumuladoEsperadoCentavos).toBe(10_000);
    expect(mar.rendimentoAcumuladoEsperadoCentavos).toBe(20_500);
  });

  it("trata mês sem CDI cadastrado como 0% esperado, mas preserva variação real", () => {
    const semCdiDeMarco = cdi.filter((c) => c.mes.getUTCMonth() !== 2);
    const [, , mar] = calcularRendimento(posicoes, semCdiDeMarco, {
      percentualCdiContratado: 100,
    });

    expect(mar.cdiMensalPercentual).toBeNull();
    expect(mar.rendimentoMensalEsperadoCentavos).toBe(0);
    expect(mar.variacaoCentavos).toBe(52_500);
    expect(mar.diferencaRealEsperadoCentavos).toBe(52_500);
  });
});

describe("projetarPatrimonioFuturo", () => {
  it("projeta patrimônio futuro por juros compostos a uma taxa mensal fixa", () => {
    const projecao = projetarPatrimonioFuturo(1_000_000, 1, 3);

    expect(projecao).toEqual([
      { mesesAFrente: 1, valorProjetadoCentavos: 1_010_000 },
      { mesesAFrente: 2, valorProjetadoCentavos: 1_020_100 },
      { mesesAFrente: 3, valorProjetadoCentavos: 1_030_301 },
    ]);
  });

  it("com taxa 0%, patrimônio projetado permanece constante", () => {
    const projecao = projetarPatrimonioFuturo(500_000, 0, 2);

    expect(projecao.every((p) => p.valorProjetadoCentavos === 500_000)).toBe(
      true,
    );
  });
});
