import { describe, expect, it } from "vitest";
import {
  melhorCandidato,
  normalizarDescricao,
  similaridade,
} from "./sugestaoCategoria";

describe("normalizarDescricao", () => {
  it("remove acentos, dígitos e pontuação, deixando maiúsculo", () => {
    expect(normalizarDescricao("Pág-Seguro*Loja 123")).toBe("PAG SEGURO LOJA");
  });
});

describe("similaridade", () => {
  it("é 1 para descrições idênticas", () => {
    expect(similaridade("Supermercado XYZ", "Supermercado XYZ")).toBe(1);
  });

  it("é alta para descrições parecidas com número de loja diferente", () => {
    const score = similaridade("SUPERMERCADO XYZ 001", "SUPERMERCADO XYZ 045");
    expect(score).toBe(1);
  });

  it("é baixa para descrições sem relação", () => {
    const score = similaridade("SUPERMERCADO XYZ", "POSTO DE GASOLINA ABC");
    expect(score).toBeLessThan(0.3);
  });
});

describe("melhorCandidato", () => {
  const candidatos = [
    {
      descricaoOrigem: "SUPERMERCADO XYZ 045",
      categoriaId: "cat-mercado",
      subcategoriaId: "sub-mercado",
    },
    {
      descricaoOrigem: "POSTO DE GASOLINA ABC",
      categoriaId: "cat-transporte",
      subcategoriaId: null,
    },
  ];

  it("retorna a categoria do candidato mais parecido", () => {
    const sugestao = melhorCandidato("Supermercado XYZ 099", candidatos);
    expect(sugestao?.categoriaId).toBe("cat-mercado");
    expect(sugestao?.subcategoriaId).toBe("sub-mercado");
  });

  it("retorna null quando nenhum candidato é parecido o suficiente", () => {
    const sugestao = melhorCandidato("Farmácia Popular", candidatos);
    expect(sugestao).toBeNull();
  });

  it("retorna null para descrição vazia", () => {
    expect(melhorCandidato("", candidatos)).toBeNull();
  });
});
