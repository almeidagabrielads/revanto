import { describe, expect, it } from "vitest";
import { unicosPorChave, unicosPorId } from "./dedupe";

describe("unicosPorId", () => {
  it("mantém a primeira ocorrência e remove repetições por id", () => {
    const itens = [
      { id: "a", nome: "Primeiro" },
      { id: "b", nome: "Segundo" },
      { id: "a", nome: "Duplicado" },
    ];

    expect(unicosPorId(itens)).toEqual([
      { id: "a", nome: "Primeiro" },
      { id: "b", nome: "Segundo" },
    ]);
  });

  it("não altera um array já sem duplicatas", () => {
    const itens = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(unicosPorId(itens)).toEqual(itens);
  });
});

describe("unicosPorChave", () => {
  it("deduplica por uma chave arbitrária", () => {
    const itens = [
      { categoriaId: "x", total: 10 },
      { categoriaId: "y", total: 20 },
      { categoriaId: "x", total: 30 },
    ];

    expect(unicosPorChave(itens, (i) => i.categoriaId)).toEqual([
      { categoriaId: "x", total: 10 },
      { categoriaId: "y", total: 20 },
    ]);
  });
});
