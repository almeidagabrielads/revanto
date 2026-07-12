import { describe, expect, it } from "vitest";
import { normalizarDescricaoParaBusca } from "./lancamentos";

describe("normalizarDescricaoParaBusca", () => {
  it("ignora diferenças de maiúsculas/minúsculas", () => {
    expect(normalizarDescricaoParaBusca("Supermercado")).toBe(
      normalizarDescricaoParaBusca("SUPERMERCADO"),
    );
  });

  it("ignora acentos gráficos", () => {
    expect(normalizarDescricaoParaBusca("Padaria Açúcar")).toBe(
      normalizarDescricaoParaBusca("padaria acucar"),
    );
  });

  it("mantém dígitos e espaços internos (só normaliza caixa/acento)", () => {
    expect(normalizarDescricaoParaBusca("Mercado 24h")).toBe("mercado 24h");
  });

  it("remove espaços nas pontas", () => {
    expect(normalizarDescricaoParaBusca("  Farmácia  ")).toBe("farmacia");
  });
});
