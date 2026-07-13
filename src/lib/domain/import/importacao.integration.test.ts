import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarCategoria } from "../categorias";
import { criarSubcategoria } from "../subcategorias";
import { criarBanco } from "../bancos";
import { criarPessoa } from "../pessoas";
import { criarLancamento } from "../lancamentos";
import { confirmarImportacao, gerarPreviewImportacao } from "./importacao";
import { calcularHashImportacao } from "./hash";

async function criarHousehold(nome = "Isa & Gabi") {
  return prismaTest.household.create({ data: { nome } });
}

async function montarCadastros(householdId: string) {
  const categoria = await criarCategoria(prismaTest, householdId, {
    nome: "Alimentação",
  });
  const subcategoriaOuNula = await criarSubcategoria(prismaTest, householdId, {
    nome: "Mercado",
    categoriaId: categoria.id,
  });
  if (!subcategoriaOuNula)
    throw new Error("falha ao montar cadastros de teste");
  const subcategoria = subcategoriaOuNula;
  const banco = await criarBanco(prismaTest, householdId, {
    nome: "Nubank",
    tipo: "CARTAO_CREDITO",
  });
  const isa = await criarPessoa(prismaTest, householdId, {
    nome: "Isa",
    tipo: "INDIVIDUAL",
  });
  const gabi = await criarPessoa(prismaTest, householdId, {
    nome: "Gabi",
    tipo: "INDIVIDUAL",
  });
  return { categoria, subcategoria, banco, isa, gabi };
}

const CSV_NUBANK_CARTAO = [
  "date,title,amount",
  "2026-06-10,Supermercado XYZ 045,150.00",
  "2026-06-11,Farmácia Popular,45.90",
].join("\n");

beforeAll(async () => {
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("gerarPreviewImportacao + confirmarImportacao — importação nova", () => {
  it("faz o parsing do CSV, gera preview e cria os lançamentos ao confirmar", async () => {
    const h = await criarHousehold();
    const { banco, isa } = await montarCadastros(h.id);

    const preview = await gerarPreviewImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      templateId: "nubank_cartao",
      csvTexto: CSV_NUBANK_CARTAO,
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.erros).toHaveLength(0);
    expect(preview.linhas).toHaveLength(2);
    expect(preview.linhas.every((l) => !l.duplicado)).toBe(true);

    const resultado = await confirmarImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      linhas: preview.linhas.map((l) => ({
        data: l.data,
        descricaoOrigem: l.descricaoOrigem,
        valorCentavos: l.valorCentavos,
      })),
    });

    expect(resultado).toEqual({ ok: true, criados: 2, duplicadosIgnorados: 0 });

    const lancamentos = await prismaTest.lancamento.findMany({
      where: { householdId: h.id },
      orderBy: { data: "asc" },
    });
    expect(lancamentos).toHaveLength(2);
    expect(lancamentos[0].valorCentavos).toBe(15000);
    expect(lancamentos[0].descricaoOrigem).toBe("Supermercado XYZ 045");
    expect(lancamentos[0].hashImportacao).toBeTruthy();
    expect(lancamentos[0].bancoId).toBe(banco.id);
  });
});

describe("gerarPreviewImportacao — período inicial", () => {
  it("ignora linhas anteriores ao período inicial informado", async () => {
    const h = await criarHousehold();
    const { banco } = await montarCadastros(h.id);

    const preview = await gerarPreviewImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      templateId: "nubank_cartao",
      csvTexto: CSV_NUBANK_CARTAO,
      dataInicial: "2026-06-11",
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.linhas).toHaveLength(1);
    expect(preview.linhas[0].descricaoOrigem).toBe("Farmácia Popular");
    expect(preview.ignoradasAntesDoPeriodo).toBe(1);
  });

  it("sem período inicial, não ignora nenhuma linha", async () => {
    const h = await criarHousehold();
    const { banco } = await montarCadastros(h.id);

    const preview = await gerarPreviewImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      templateId: "nubank_cartao",
      csvTexto: CSV_NUBANK_CARTAO,
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.linhas).toHaveLength(2);
    expect(preview.ignoradasAntesDoPeriodo).toBe(0);
  });
});

describe("gerarPreviewImportacao + confirmarImportacao — detecção de duplicado", () => {
  it("marca como duplicado no preview e não recria ao confirmar de novo", async () => {
    const h = await criarHousehold();
    const { banco, isa } = await montarCadastros(h.id);

    const primeiroPreview = await gerarPreviewImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      templateId: "nubank_cartao",
      csvTexto: CSV_NUBANK_CARTAO,
    });
    expect(primeiroPreview.ok).toBe(true);
    if (!primeiroPreview.ok) return;

    await confirmarImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      linhas: primeiroPreview.linhas.map((l) => ({
        data: l.data,
        descricaoOrigem: l.descricaoOrigem,
        valorCentavos: l.valorCentavos,
      })),
    });

    // Reimporta o mesmo arquivo (cenário comum: usuário baixa a fatura de novo).
    const segundoPreview = await gerarPreviewImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      templateId: "nubank_cartao",
      csvTexto: CSV_NUBANK_CARTAO,
    });
    expect(segundoPreview.ok).toBe(true);
    if (!segundoPreview.ok) return;
    expect(segundoPreview.linhas.every((l) => l.duplicado)).toBe(true);

    const resultado = await confirmarImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      linhas: segundoPreview.linhas.map((l) => ({
        data: l.data,
        descricaoOrigem: l.descricaoOrigem,
        valorCentavos: l.valorCentavos,
      })),
    });

    expect(resultado).toEqual({ ok: true, criados: 0, duplicadosIgnorados: 2 });

    const total = await prismaTest.lancamento.count({
      where: { householdId: h.id },
    });
    expect(total).toBe(2);
  });

  it("um novo lançamento com valor diferente no mesmo dia/descrição não é tratado como duplicado", async () => {
    const h = await criarHousehold();
    const { banco, isa } = await montarCadastros(h.id);

    await confirmarImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      linhas: [
        {
          data: "2026-06-10",
          descricaoOrigem: "Supermercado XYZ 045",
          valorCentavos: 15000,
        },
      ],
    });

    const preview = await gerarPreviewImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      templateId: "generico",
      csvTexto: [
        "Data,Descrição Cartão,Valor",
        '10/06/2026,Supermercado XYZ 045,"151,00"',
      ].join("\n"),
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.linhas[0].duplicado).toBe(false);
  });
});

describe("gerarPreviewImportacao — sugestão de categoria", () => {
  it("sugere a categoria de um lançamento anterior com descrição parecida", async () => {
    const h = await criarHousehold();
    const { categoria, subcategoria, banco, isa } = await montarCadastros(h.id);

    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-05-05"),
      descricaoOrigem: "Supermercado XYZ 001",
      valorCentavos: 12000,
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    const preview = await gerarPreviewImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      templateId: "nubank_cartao",
      csvTexto: CSV_NUBANK_CARTAO,
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const linhaMercado = preview.linhas.find((l) =>
      l.descricaoOrigem.includes("Supermercado"),
    );
    expect(linhaMercado?.categoriaSugeridaId).toBe(categoria.id);
    expect(linhaMercado?.subcategoriaSugeridaId).toBe(subcategoria.id);

    const linhaFarmacia = preview.linhas.find((l) =>
      l.descricaoOrigem.includes("Farmácia"),
    );
    expect(linhaFarmacia?.categoriaSugeridaId).toBeNull();
  });

  it("não sugere categoria para uma linha marcada como duplicada", async () => {
    const h = await criarHousehold();
    const { categoria, banco, isa } = await montarCadastros(h.id);

    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      descricaoOrigem: "Supermercado XYZ 045",
      valorCentavos: 15000,
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });
    // Simula que esse mesmo lançamento já veio de uma importação anterior,
    // atribuindo o hash que o CSV de exemplo geraria para essa linha.
    const jaImportado = await prismaTest.lancamento.findFirst({
      where: { householdId: h.id, descricaoOrigem: "Supermercado XYZ 045" },
    });
    await prismaTest.lancamento.update({
      where: { id: jaImportado!.id },
      data: {
        hashImportacao: calcularHashImportacao({
          data: new Date("2026-06-10"),
          descricaoOrigem: "Supermercado XYZ 045",
          valorCentavos: 15000,
          bancoId: banco.id,
        }),
      },
    });

    const preview = await gerarPreviewImportacao(prismaTest, h.id, {
      bancoId: banco.id,
      templateId: "nubank_cartao",
      csvTexto: CSV_NUBANK_CARTAO,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const linhaMercado = preview.linhas.find((l) =>
      l.descricaoOrigem.includes("Supermercado"),
    );
    expect(linhaMercado?.duplicado).toBe(true);
    expect(linhaMercado?.categoriaSugeridaId).toBeNull();
  });
});
