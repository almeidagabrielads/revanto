import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarCategoria } from "./categorias";
import {
  atualizarSubcategoria,
  buscarSubcategoria,
  criarSubcategoria,
  inativarSubcategoria,
  listarSubcategorias,
  reativarSubcategoria,
} from "./subcategorias";

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

describe("criarSubcategoria", () => {
  it("cria subcategoria vinculada à categoria e ao household, ativa por padrão", async () => {
    const h = await criarHousehold();
    const categoria = await criarCategoria(prismaTest, h.id, { nome: "Casa" });

    const subcategoria = await criarSubcategoria(prismaTest, h.id, {
      nome: "Energia",
      categoriaId: categoria.id,
    });

    expect(subcategoria?.householdId).toBe(h.id);
    expect(subcategoria?.categoriaId).toBe(categoria.id);
    expect(subcategoria?.ativo).toBe(true);
  });

  it("retorna null se a categoria não pertence ao household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const categoria = await criarCategoria(prismaTest, h1.id, {
      nome: "Casa",
    });

    const subcategoria = await criarSubcategoria(prismaTest, h2.id, {
      nome: "Energia",
      categoriaId: categoria.id,
    });

    expect(subcategoria).toBeNull();
  });
});

describe("listarSubcategorias", () => {
  it("filtra por categoria quando informado", async () => {
    const h = await criarHousehold();
    const casa = await criarCategoria(prismaTest, h.id, { nome: "Casa" });
    const viagem = await criarCategoria(prismaTest, h.id, { nome: "Viagem" });
    await criarSubcategoria(prismaTest, h.id, {
      nome: "Energia",
      categoriaId: casa.id,
    });
    await criarSubcategoria(prismaTest, h.id, {
      nome: "Passagem",
      categoriaId: viagem.id,
    });

    const subcategorias = await listarSubcategorias(prismaTest, h.id, {
      categoriaId: casa.id,
    });
    expect(subcategorias).toHaveLength(1);
    expect(subcategorias[0].nome).toBe("Energia");
  });

  it("por padrão não lista subcategorias inativas", async () => {
    const h = await criarHousehold();
    const categoria = await criarCategoria(prismaTest, h.id, { nome: "Casa" });
    const subcategoria = await criarSubcategoria(prismaTest, h.id, {
      nome: "Energia",
      categoriaId: categoria.id,
    });
    await inativarSubcategoria(prismaTest, h.id, subcategoria!.id);

    const subcategorias = await listarSubcategorias(prismaTest, h.id);
    expect(subcategorias).toHaveLength(0);
  });
});

describe("buscarSubcategoria", () => {
  it("não retorna subcategoria de outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const categoria = await criarCategoria(prismaTest, h1.id, {
      nome: "Casa",
    });
    const subcategoria = await criarSubcategoria(prismaTest, h1.id, {
      nome: "Energia",
      categoriaId: categoria.id,
    });

    const resultado = await buscarSubcategoria(
      prismaTest,
      h2.id,
      subcategoria!.id,
    );
    expect(resultado).toBeNull();
  });
});

describe("atualizarSubcategoria", () => {
  it("atualiza nome", async () => {
    const h = await criarHousehold();
    const categoria = await criarCategoria(prismaTest, h.id, { nome: "Casa" });
    const subcategoria = await criarSubcategoria(prismaTest, h.id, {
      nome: "Energia",
      categoriaId: categoria.id,
    });

    const atualizada = await atualizarSubcategoria(
      prismaTest,
      h.id,
      subcategoria!.id,
      { nome: "Luz" },
    );
    expect(atualizada?.nome).toBe("Luz");
  });
});

describe("inativarSubcategoria / reativarSubcategoria", () => {
  it("inativa sem excluir fisicamente e permite reativar", async () => {
    const h = await criarHousehold();
    const categoria = await criarCategoria(prismaTest, h.id, { nome: "Casa" });
    const subcategoria = await criarSubcategoria(prismaTest, h.id, {
      nome: "Energia",
      categoriaId: categoria.id,
    });

    const inativada = await inativarSubcategoria(
      prismaTest,
      h.id,
      subcategoria!.id,
    );
    expect(inativada?.ativo).toBe(false);

    const aindaExiste = await prismaTest.subcategoria.findUnique({
      where: { id: subcategoria!.id },
    });
    expect(aindaExiste).not.toBeNull();

    const reativada = await reativarSubcategoria(
      prismaTest,
      h.id,
      subcategoria!.id,
    );
    expect(reativada?.ativo).toBe(true);
  });
});
