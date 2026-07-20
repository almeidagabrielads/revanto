import { describe, expect, it } from "vitest";
import {
  centavosParaReais,
  reaisParaCentavos,
  formatarMoeda,
} from "./formatacao";

describe("centavosParaReais", () => {
  it("converte centavos para string com duas casas decimais", () => {
    expect(centavosParaReais(12345)).toBe("123.45");
  });

  it("lida com zero", () => {
    expect(centavosParaReais(0)).toBe("0.00");
  });
});

describe("reaisParaCentavos", () => {
  it("converte string com ponto decimal", () => {
    expect(reaisParaCentavos("123.45")).toBe(12345);
  });

  it("converte string com vírgula decimal", () => {
    expect(reaisParaCentavos("123,45")).toBe(12345);
  });

  it("retorna 0 para string vazia", () => {
    expect(reaisParaCentavos("")).toBe(0);
  });

  it("retorna 0 para string em branco", () => {
    expect(reaisParaCentavos("   ")).toBe(0);
  });

  it("arredonda valores com mais de duas casas", () => {
    expect(reaisParaCentavos("10.005")).toBe(1001);
  });
});

describe("formatarMoeda", () => {
  it("formata em BRL", () => {
    expect(formatarMoeda(12345)).toBe("R$ 123,45");
  });

  it("usa valor absoluto (ignora sinal)", () => {
    expect(formatarMoeda(-12345)).toBe(formatarMoeda(12345));
  });
});
