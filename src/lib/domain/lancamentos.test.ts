import { describe, expect, it } from "vitest";
import {
  normalizarDescricaoParaBusca,
  intervaloDoMes,
  validarFormLancamento,
  montarRequisicaoCriarLancamento,
  resumoImportacaoTexto,
  type FormLancamento,
} from "./lancamentos";
import { reaisParaCentavos } from "./formatacao";

function formBase(overrides: Partial<FormLancamento> = {}): FormLancamento {
  return {
    data: "2026-07-20",
    descricaoPropria: "",
    valor: "100.00",
    desconto: "",
    categoriaId: "",
    subcategoriaId: "",
    bancoId: "banco-1",
    pessoaDivisaoId: "pessoa-1",
    pessoaPagouId: "pessoa-1",
    pagoComResgateInvestimento: false,
    investimentoResgateId: "",
    tipoGasto: "VARIAVEL",
    parcelar: false,
    quantidadeParcelas: "2",
    modoParcelamento: "GRADUAL",
    ...overrides,
  };
}

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

describe("intervaloDoMes", () => {
  it("retorna primeiro e último dia do mês", () => {
    expect(intervaloDoMes(2026, 0)).toEqual({
      inicio: "2026-01-01",
      fim: "2026-01-31",
    });
  });

  it("lida com fevereiro em ano bissexto", () => {
    expect(intervaloDoMes(2024, 1)).toEqual({
      inicio: "2024-02-01",
      fim: "2024-02-29",
    });
  });

  it("lida com fevereiro fora de ano bissexto", () => {
    expect(intervaloDoMes(2026, 1)).toEqual({
      inicio: "2026-02-01",
      fim: "2026-02-28",
    });
  });
});

describe("validarFormLancamento", () => {
  it("aceita um formulário válido", () => {
    expect(validarFormLancamento(formBase(), reaisParaCentavos)).toBeNull();
  });

  it("exige data", () => {
    expect(
      validarFormLancamento(formBase({ data: "" }), reaisParaCentavos),
    ).toMatch(/data/i);
  });

  it("exige banco", () => {
    expect(
      validarFormLancamento(formBase({ bancoId: "" }), reaisParaCentavos),
    ).toMatch(/banco/i);
  });

  it("exige valor diferente de zero", () => {
    expect(
      validarFormLancamento(formBase({ valor: "0" }), reaisParaCentavos),
    ).toMatch(/valor/i);
  });

  it("rejeita desconto negativo", () => {
    expect(
      validarFormLancamento(formBase({ desconto: "-10" }), reaisParaCentavos),
    ).toMatch(/desconto/i);
  });

  it("exige quantidade de parcelas válida quando parcelar", () => {
    expect(
      validarFormLancamento(
        formBase({ parcelar: true, quantidadeParcelas: "1" }),
        reaisParaCentavos,
      ),
    ).toMatch(/parcela/i);
  });
});

describe("montarRequisicaoCriarLancamento", () => {
  it("monta requisição de lançamento simples", () => {
    const req = montarRequisicaoCriarLancamento(formBase(), reaisParaCentavos);
    expect(req.url).toBe("/api/lancamentos");
    expect(req.body).toMatchObject({
      valorCentavos: 10000,
      bancoId: "banco-1",
    });
  });

  it("monta requisição de parcelamento", () => {
    const req = montarRequisicaoCriarLancamento(
      formBase({ parcelar: true, quantidadeParcelas: "3" }),
      reaisParaCentavos,
    );
    expect(req.url).toBe("/api/parcelamentos");
    expect(req.body).toMatchObject({
      valorParcelaCentavos: 10000,
      quantidadeParcelas: 3,
    });
  });
});

describe("resumoImportacaoTexto", () => {
  it("mostra apenas as prontas quando não há erros/duplicadas", () => {
    expect(
      resumoImportacaoTexto({
        novas: 5,
        duplicadas: 0,
        ignoradasAntesDoPeriodo: 0,
        erros: [],
      }),
    ).toBe("5 pronto(s) para revisão.");
  });

  it("inclui duplicadas, fora do período e erros quando presentes", () => {
    expect(
      resumoImportacaoTexto({
        novas: 5,
        duplicadas: 2,
        ignoradasAntesDoPeriodo: 1,
        erros: [{ numeroLinha: 3, motivo: "data inválida" }],
      }),
    ).toBe(
      "5 pronto(s) para revisão, 2 duplicado(s), 1 fora do período, 1 com erro de leitura.",
    );
  });
});
