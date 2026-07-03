import { describe, expect, it } from "vitest";
import { calcularHashImportacao } from "./hash";

describe("calcularHashImportacao", () => {
  const base = {
    data: new Date("2026-06-10T00:00:00Z"),
    descricaoOrigem: "Supermercado XYZ",
    valorCentavos: 15000,
    bancoId: "banco-1",
  };

  it("é determinístico para os mesmos dados", () => {
    expect(calcularHashImportacao(base)).toBe(calcularHashImportacao(base));
  });

  it("ignora diferenças de maiúsculas/espaços na descrição", () => {
    const hashA = calcularHashImportacao(base);
    const hashB = calcularHashImportacao({
      ...base,
      descricaoOrigem: "  supermercado   xyz ",
    });
    expect(hashA).toBe(hashB);
  });

  it("muda se o valor mudar", () => {
    const hashA = calcularHashImportacao(base);
    const hashB = calcularHashImportacao({ ...base, valorCentavos: 15001 });
    expect(hashA).not.toBe(hashB);
  });

  it("muda se o banco mudar", () => {
    const hashA = calcularHashImportacao(base);
    const hashB = calcularHashImportacao({ ...base, bancoId: "banco-2" });
    expect(hashA).not.toBe(hashB);
  });

  it("muda se a data mudar", () => {
    const hashA = calcularHashImportacao(base);
    const hashB = calcularHashImportacao({
      ...base,
      data: new Date("2026-06-11T00:00:00Z"),
    });
    expect(hashA).not.toBe(hashB);
  });
});
