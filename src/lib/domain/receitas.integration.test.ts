import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarPessoa } from "./pessoas";
import {
  atualizarReceita,
  buscarReceita,
  criarReceita,
  listarReceitas,
  removerReceita,
} from "./receitas";

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

describe("criarReceita", () => {
  it("cria receita vinculada à pessoa e ao household, normalizando o mês", async () => {
    const h = await criarHousehold();
    const isa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });

    const receita = await criarReceita(prismaTest, h.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 500000,
      mes: new Date("2026-06-15"),
    });

    expect(receita?.householdId).toBe(h.id);
    expect(receita?.pessoaId).toBe(isa.id);
    expect(receita?.mes.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("retorna null se pessoa pertence a outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const isa = await criarPessoa(prismaTest, h1.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });

    const receita = await criarReceita(prismaTest, h2.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 500000,
      mes: new Date("2026-06-15"),
    });

    expect(receita).toBeNull();
  });
});

describe("atualizarReceita", () => {
  it("atualiza valor e subtipo", async () => {
    const h = await criarHousehold();
    const isa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const receita = await criarReceita(prismaTest, h.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 500000,
      mes: new Date("2026-06-15"),
    });

    const atualizada = await atualizarReceita(prismaTest, h.id, receita!.id, {
      subtipo: "VOUCHER",
      valorCentavos: 30000,
    });

    expect(atualizada?.subtipo).toBe("VOUCHER");
    expect(atualizada?.valorCentavos).toBe(30000);
  });

  it("normaliza mês ao atualizar", async () => {
    const h = await criarHousehold();
    const isa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const receita = await criarReceita(prismaTest, h.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 500000,
      mes: new Date("2026-06-15"),
    });

    const atualizada = await atualizarReceita(prismaTest, h.id, receita!.id, {
      mes: new Date("2026-07-20"),
    });

    expect(atualizada?.mes.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("retorna null para receita inexistente", async () => {
    const h = await criarHousehold();
    const atualizada = await atualizarReceita(prismaTest, h.id, "id-fake", {
      valorCentavos: 100,
    });
    expect(atualizada).toBeNull();
  });
});

describe("removerReceita", () => {
  it("remove fisicamente a receita", async () => {
    const h = await criarHousehold();
    const isa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const receita = await criarReceita(prismaTest, h.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 500000,
      mes: new Date("2026-06-15"),
    });

    const removida = await removerReceita(prismaTest, h.id, receita!.id);
    expect(removida).not.toBeNull();

    const buscada = await prismaTest.receita.findUnique({
      where: { id: receita!.id },
    });
    expect(buscada).toBeNull();
  });
});

describe("buscarReceita", () => {
  it("não retorna receita de outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const isa = await criarPessoa(prismaTest, h1.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const receita = await criarReceita(prismaTest, h1.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 500000,
      mes: new Date("2026-06-15"),
    });

    const resultado = await buscarReceita(prismaTest, h2.id, receita!.id);
    expect(resultado).toBeNull();
  });
});

describe("listarReceitas (filtros)", () => {
  it("filtra por pessoa", async () => {
    const h = await criarHousehold();
    const isa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const gabi = await criarPessoa(prismaTest, h.id, {
      nome: "Gabi",
      tipo: "INDIVIDUAL",
    });
    await criarReceita(prismaTest, h.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 500000,
      mes: new Date("2026-06-15"),
    });
    await criarReceita(prismaTest, h.id, {
      pessoaId: gabi.id,
      subtipo: "SALARIO",
      valorCentavos: 600000,
      mes: new Date("2026-06-15"),
    });

    const receitas = await listarReceitas(prismaTest, h.id, {
      pessoaId: isa.id,
    });

    expect(receitas).toHaveLength(1);
    expect(receitas[0].pessoaId).toBe(isa.id);
  });

  it("filtra por intervalo de mês", async () => {
    const h = await criarHousehold();
    const isa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    await criarReceita(prismaTest, h.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 500000,
      mes: new Date("2026-05-10"),
    });
    await criarReceita(prismaTest, h.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 510000,
      mes: new Date("2026-06-10"),
    });

    const receitas = await listarReceitas(prismaTest, h.id, {
      mesInicio: new Date("2026-06-01"),
      mesFim: new Date("2026-06-30"),
    });

    expect(receitas).toHaveLength(1);
    expect(receitas[0].valorCentavos).toBe(510000);
  });
});
