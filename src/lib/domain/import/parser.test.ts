import { describe, expect, it } from "vitest";
import { parseImportacao } from "./parser";
import { IMPORT_TEMPLATES } from "./templates";

describe("parseImportacao — Nubank cartão", () => {
  const csv = [
    "date,title,amount",
    "2026-06-10,Supermercado XYZ,150.00",
    "2026-06-11,Estorno Loja ABC,-50.00",
  ].join("\n");

  it("faz parsing de despesas e estornos (RF05)", () => {
    const { linhas, erros } = parseImportacao(
      csv,
      IMPORT_TEMPLATES.nubank_cartao,
    );
    expect(erros).toHaveLength(0);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      descricaoOrigem: "Supermercado XYZ",
      valorCentavos: 15000,
    });
    expect(linhas[0].data.toISOString().slice(0, 10)).toBe("2026-06-10");
    expect(linhas[1].valorCentavos).toBe(-5000);
  });
});

describe("parseImportacao — Nubank conta", () => {
  it("inverte o sinal (saída vem negativa no arquivo, despesa é positiva no domínio)", () => {
    const csv = [
      "Data,Valor,Identificador,Descrição",
      "10/06/2026,-89.90,abc123,Farmácia Popular",
    ].join("\n");

    const { linhas } = parseImportacao(csv, IMPORT_TEMPLATES.nubank_conta);
    expect(linhas[0].valorCentavos).toBe(8990);
    expect(linhas[0].data.toISOString().slice(0, 10)).toBe("2026-06-10");
  });
});

describe("parseImportacao — Itaú extrato", () => {
  it("lida com delimitador ; e decimal com vírgula", () => {
    const csv = [
      "data;lançamento;valor;saldo",
      "10/06/2026;Compra cartão débito;-1.234,56;5000,00",
    ].join("\n");

    const { linhas, erros } = parseImportacao(
      csv,
      IMPORT_TEMPLATES.itau_extrato,
    );
    expect(erros).toHaveLength(0);
    expect(linhas[0].valorCentavos).toBe(123456);
    expect(linhas[0].descricaoOrigem).toBe("Compra cartão débito");
  });
});

describe("parseImportacao — Bradesco extrato (crédito/débito)", () => {
  it("usa a coluna de débito como despesa", () => {
    const csv = [
      "Data,Histórico,Docto.,Crédito (R$),Débito (R$),Saldo (R$)",
      '10/06/2026,Compra no débito,123,,"150,00","4850,00"',
    ].join("\n");

    const { linhas } = parseImportacao(csv, IMPORT_TEMPLATES.bradesco_extrato);
    expect(linhas[0].valorCentavos).toBe(15000);
  });

  it("usa a coluna de crédito como valor negativo (estorno/entrada)", () => {
    const csv = [
      "Data,Histórico,Docto.,Crédito (R$),Débito (R$),Saldo (R$)",
      '11/06/2026,Estorno,124,"200,00",,"5050,00"',
    ].join("\n");

    const { linhas } = parseImportacao(csv, IMPORT_TEMPLATES.bradesco_extrato);
    expect(linhas[0].valorCentavos).toBe(-20000);
  });
});

describe("parseImportacao — Banco do Brasil (valor + indicador)", () => {
  it("usa o indicador de tipo de lançamento para definir o sinal", () => {
    const csv = [
      "Data,Histórico,Valor,Tipo Lançamento",
      '10/06/2026,Compra no débito,"80,50",D',
    ].join("\n");

    const { linhas } = parseImportacao(csv, IMPORT_TEMPLATES.bb_extrato);
    expect(linhas[0].valorCentavos).toBe(8050);
  });
});

describe("parseImportacao — genérico", () => {
  it("reporta erro para data e valor inválidos sem interromper as demais linhas", () => {
    const csv = [
      "data,descricao,valor",
      "2026-06-10,Compra válida,100.00",
      "data-invalida,Compra com data ruim,50.00",
      "2026-06-12,,30.00",
      "2026-06-13,Sem valor,",
    ].join("\n");

    const { linhas, erros } = parseImportacao(csv, IMPORT_TEMPLATES.generico);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].descricaoOrigem).toBe("Compra válida");
    expect(erros).toHaveLength(3);
  });
});
