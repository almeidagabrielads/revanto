import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import {
  atualizarCategoria,
  buscarCategoria,
  criarCategoria,
  inativarCategoria,
  listarCategorias,
  reativarCategoria,
} from "./categorias";

async function criarHousehold(nome = "Isa & Gabi") {
  return prismaTest.household.create({ data: { nome } });
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

describe("criarCategoria", () => {
  it("cria categoria vinculada ao household, ativa por padrão", async () => {
    const h = await criarHousehold();
    const categoria = await criarCategoria(prismaTest, h.id, {
      nome: "Alimentação",
      percentualOrcamento: 20,
    });

    expect(categoria.householdId).toBe(h.id);
    expect(categoria.ativo).toBe(true);
    expect(Number(categoria.percentualOrcamento)).toBe(20);
  });
});

describe("listarCategorias", () => {
  it("lista apenas categorias do household informado", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    await criarCategoria(prismaTest, h1.id, { nome: "Casa" });
    await criarCategoria(prismaTest, h2.id, { nome: "Viagem" });

    const categoriasH1 = await listarCategorias(prismaTest, h1.id);
    expect(categoriasH1).toHaveLength(1);
    expect(categoriasH1[0].nome).toBe("Casa");
  });

  it("ordena por nome e inclui subcategorias", async () => {
    const h = await criarHousehold();
    const categoria = await criarCategoria(prismaTest, h.id, { nome: "Zeca" });
    await criarCategoria(prismaTest, h.id, { nome: "Ana" });
    await prismaTest.subcategoria.create({
      data: { nome: "Sub", categoriaId: categoria.id, householdId: h.id },
    });

    const categorias = await listarCategorias(prismaTest, h.id);
    expect(categorias.map((c) => c.nome)).toEqual(["Ana", "Zeca"]);
    expect(categorias[1].subcategorias).toHaveLength(1);
  });

  it("por padrão não lista categorias inativas", async () => {
    const h = await criarHousehold();
    const categoria = await criarCategoria(prismaTest, h.id, { nome: "Casa" });
    await inativarCategoria(prismaTest, h.id, categoria.id);

    const categorias = await listarCategorias(prismaTest, h.id);
    expect(categorias).toHaveLength(0);
  });

  it("inclui categorias inativas quando solicitado", async () => {
    const h = await criarHousehold();
    const categoria = await criarCategoria(prismaTest, h.id, { nome: "Casa" });
    await inativarCategoria(prismaTest, h.id, categoria.id);

    const categorias = await listarCategorias(prismaTest, h.id, {
      incluirInativas: true,
    });
    expect(categorias).toHaveLength(1);
  });
});

describe("buscarCategoria", () => {
  it("não retorna categoria de outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const categoria = await criarCategoria(prismaTest, h1.id, {
      nome: "Casa",
    });

    const resultado = await buscarCategoria(prismaTest, h2.id, categoria.id);
    expect(resultado).toBeNull();
  });
});

describe("atualizarCategoria", () => {
  it("atualiza nome e percentual", async () => {
    const h = await criarHousehold();
    const categoria = await criarCategoria(prismaTest, h.id, {
      nome: "Casa",
      percentualOrcamento: 10,
    });

    const atualizada = await atualizarCategoria(
      prismaTest,
      h.id,
      categoria.id,
      {
        percentualOrcamento: 25,
      },
    );

    expect(Number(atualizada?.percentualOrcamento)).toBe(25);
  });

  it("retorna null ao tentar atualizar categoria de outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const categoria = await criarCategoria(prismaTest, h1.id, {
      nome: "Casa",
    });

    const resultado = await atualizarCategoria(
      prismaTest,
      h2.id,
      categoria.id,
      {
        nome: "Invasora",
      },
    );
    expect(resultado).toBeNull();
  });
});

describe("inativarCategoria / reativarCategoria", () => {
  it("inativa sem excluir fisicamente e permite reativar", async () => {
    const h = await criarHousehold();
    const categoria = await criarCategoria(prismaTest, h.id, { nome: "Casa" });

    const inativada = await inativarCategoria(prismaTest, h.id, categoria.id);
    expect(inativada?.ativo).toBe(false);

    const aindaExiste = await prismaTest.categoria.findUnique({
      where: { id: categoria.id },
    });
    expect(aindaExiste).not.toBeNull();

    const reativada = await reativarCategoria(prismaTest, h.id, categoria.id);
    expect(reativada?.ativo).toBe(true);
  });

  it("retorna null ao tentar inativar categoria de outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const categoria = await criarCategoria(prismaTest, h1.id, {
      nome: "Casa",
    });

    const resultado = await inativarCategoria(prismaTest, h2.id, categoria.id);
    expect(resultado).toBeNull();
  });
});
