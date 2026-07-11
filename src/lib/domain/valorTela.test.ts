import { describe, expect, it } from "vitest";
import { extrairValorTela } from "./valorTela";

describe("extrairValorTela", () => {
  it("extrai valor no formato pt-BR completo (milhar e decimal)", () => {
    expect(extrairValorTela("R$ 1.234,56")).toBe(1234.56);
  });

  it("extrai valor negativo no formato pt-BR completo", () => {
    expect(extrairValorTela("-R$ 45,00")).toBe(-45);
  });

  it("extrai valor apenas com vírgula decimal", () => {
    expect(extrairValorTela("R$ 13,63")).toBe(13.63);
  });

  it("extrai valor apenas com ponto decimal (2 casas)", () => {
    expect(extrairValorTela("R$ 13.63")).toBe(13.63);
  });

  it("extrai valor grande apenas com ponto decimal (2 casas)", () => {
    expect(extrairValorTela("R$ 2440.23")).toBe(2440.23);
  });

  it("trata ponto isolado com 3 dígitos como separador de milhar", () => {
    expect(extrairValorTela("R$ 2.440")).toBe(2440);
  });

  it("ignora texto sem dígitos", () => {
    expect(extrairValorTela("—")).toBeNull();
  });

  it("ignora texto vazio", () => {
    expect(extrairValorTela("   ")).toBeNull();
  });

  it("extrai percentual ignorando o símbolo", () => {
    expect(extrairValorTela("12,5%")).toBe(12.5);
  });
});
