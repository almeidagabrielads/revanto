import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarPessoa } from "./pessoas";
import { criarCategoria } from "./categorias";
import { criarSubcategoria } from "./subcategorias";
import {
  atualizarOrcamento,
  buscarOrcamento,
  criarOrcamento,
  listarOrcamentos,
  removerOrcamento,
} from "./orcamento";

async function criarHousehold(nome = "Isa & Gabi") {
  return prismaTest.household.create({ data: { nome } });
}

async function montarBase(householdNome = "Isa & Gabi") {
  const household = await criarHousehold(householdNome);
  const isa = await criarPessoa(prismaTest, household.id, {
    nome: "Isa",
    tipo: "INDIVIDUAL",
  });
  const categoria = await criarCategoria(prismaTest, household.id, {
    nome: "Moradia",
  });
  const subcategoria = await criarSubcategoria(prismaTest, household.id, {
    nome: "Aluguel",
    categoriaId: categoria.id,
  });
  return { household, isa, categoria, subcategoria };
}

beforeAll(async () => {
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("criarOrcamento", () => {
  it("cria orçamento mensal individual vinculado à pessoa, categoria e subcategoria", async () => {
    const { household, isa, categoria, subcategoria } = await montarBase();

    const orcamento = await criarOrcamento(prismaTest, household.id, {
      pessoaId: isa.id,
      categoriaId: categoria.id,
      subcategoriaId: subcategoria!.id,
      mes: 6,
      ano: 2026,
      valorCentavos: 150000,
    });

    expect(orcamento?.householdId).toBe(household.id);
    expect(orcamento?.pessoaId).toBe(isa.id);
    expect(orcamento?.mes).toBe(6);
    expect(orcamento?.ano).toBe(2026);
  });

  it("retorna null se pessoaId é de um grupo (CASAL/FAMILIA/OUTRO), não de uma pessoa INDIVIDUAL", async () => {
    const { household, categoria } = await montarBase();
    const casal = await criarPessoa(prismaTest, household.id, {
      nome: "Casal",
      tipo: "CASAL",
    });

    const orcamento = await criarOrcamento(prismaTest, household.id, {
      pessoaId: casal.id,
      categoriaId: categoria.id,
      ano: 2026,
      valorCentavos: 1200000,
    });

    expect(orcamento).toBeNull();
  });

  it("retorna null se pessoa pertence a outro household", async () => {
    const { categoria } = await montarBase("Casa A");
    const h2 = await criarHousehold("Casa B");
    const isaDeOutraCasa = await criarPessoa(prismaTest, h2.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });

    const orcamento = await criarOrcamento(prismaTest, h2.id, {
      pessoaId: isaDeOutraCasa.id,
      categoriaId: categoria.id,
      ano: 2026,
      valorCentavos: 1000,
    });

    expect(orcamento).toBeNull();
  });

  it("retorna null se categoria pertence a outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const isa = await criarPessoa(prismaTest, h2.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const categoriaDeOutraCasa = await criarCategoria(prismaTest, h1.id, {
      nome: "Moradia",
    });

    const orcamento = await criarOrcamento(prismaTest, h2.id, {
      pessoaId: isa.id,
      categoriaId: categoriaDeOutraCasa.id,
      ano: 2026,
      valorCentavos: 1000,
    });

    expect(orcamento).toBeNull();
  });

  it("retorna null se subcategoria não pertence à categoria informada", async () => {
    const { household, isa, categoria } = await montarBase();
    const outraCategoria = await criarCategoria(prismaTest, household.id, {
      nome: "Transporte",
    });
    const subOutraCategoria = await criarSubcategoria(
      prismaTest,
      household.id,
      {
        nome: "Combustível",
        categoriaId: outraCategoria.id,
      },
    );

    const orcamento = await criarOrcamento(prismaTest, household.id, {
      pessoaId: isa.id,
      categoriaId: categoria.id,
      subcategoriaId: subOutraCategoria!.id,
      ano: 2026,
      valorCentavos: 1000,
    });

    expect(orcamento).toBeNull();
  });
});

describe("atualizarOrcamento", () => {
  it("atualiza valor e mês", async () => {
    const { household, isa, categoria } = await montarBase();
    const orcamento = await criarOrcamento(prismaTest, household.id, {
      pessoaId: isa.id,
      categoriaId: categoria.id,
      mes: 1,
      ano: 2026,
      valorCentavos: 100000,
    });

    const atualizado = await atualizarOrcamento(
      prismaTest,
      household.id,
      orcamento!.id,
      { valorCentavos: 200000, mes: 2 },
    );

    expect(atualizado?.valorCentavos).toBe(200000);
    expect(atualizado?.mes).toBe(2);
  });

  it("retorna null para orçamento inexistente", async () => {
    const { household } = await montarBase();
    const atualizado = await atualizarOrcamento(
      prismaTest,
      household.id,
      "id-fake",
      { valorCentavos: 100 },
    );
    expect(atualizado).toBeNull();
  });
});

describe("removerOrcamento", () => {
  it("remove fisicamente o orçamento", async () => {
    const { household, isa, categoria } = await montarBase();
    const orcamento = await criarOrcamento(prismaTest, household.id, {
      pessoaId: isa.id,
      categoriaId: categoria.id,
      ano: 2026,
      valorCentavos: 100000,
    });

    const removido = await removerOrcamento(
      prismaTest,
      household.id,
      orcamento!.id,
    );
    expect(removido).not.toBeNull();

    const buscado = await prismaTest.orcamentoPlanejado.findUnique({
      where: { id: orcamento!.id },
    });
    expect(buscado).toBeNull();
  });
});

describe("buscarOrcamento", () => {
  it("não retorna orçamento de outro household", async () => {
    const { household, isa, categoria } = await montarBase("Casa A");
    const h2 = await criarHousehold("Casa B");
    const orcamento = await criarOrcamento(prismaTest, household.id, {
      pessoaId: isa.id,
      categoriaId: categoria.id,
      ano: 2026,
      valorCentavos: 1000,
    });

    const resultado = await buscarOrcamento(prismaTest, h2.id, orcamento!.id);
    expect(resultado).toBeNull();
  });
});

describe("listarOrcamentos (filtros)", () => {
  it("filtra por pessoa", async () => {
    const { household, isa, categoria } = await montarBase();
    const gabi = await criarPessoa(prismaTest, household.id, {
      nome: "Gabi",
      tipo: "INDIVIDUAL",
    });
    await criarOrcamento(prismaTest, household.id, {
      pessoaId: isa.id,
      categoriaId: categoria.id,
      ano: 2026,
      valorCentavos: 100000,
    });
    await criarOrcamento(prismaTest, household.id, {
      pessoaId: gabi.id,
      categoriaId: categoria.id,
      ano: 2026,
      valorCentavos: 200000,
    });

    const orcamentos = await listarOrcamentos(prismaTest, household.id, {
      pessoaId: isa.id,
    });

    expect(orcamentos).toHaveLength(1);
    expect(orcamentos[0].pessoaId).toBe(isa.id);
  });

  it("filtra por ano e mês", async () => {
    const { household, isa, categoria } = await montarBase();
    await criarOrcamento(prismaTest, household.id, {
      pessoaId: isa.id,
      categoriaId: categoria.id,
      mes: 1,
      ano: 2026,
      valorCentavos: 100000,
    });
    await criarOrcamento(prismaTest, household.id, {
      pessoaId: isa.id,
      categoriaId: categoria.id,
      mes: 2,
      ano: 2026,
      valorCentavos: 200000,
    });
    await criarOrcamento(prismaTest, household.id, {
      pessoaId: isa.id,
      categoriaId: categoria.id,
      mes: 1,
      ano: 2025,
      valorCentavos: 300000,
    });

    const orcamentos = await listarOrcamentos(prismaTest, household.id, {
      ano: 2026,
      mes: 1,
    });

    expect(orcamentos).toHaveLength(1);
    expect(orcamentos[0].valorCentavos).toBe(100000);
  });
});
