import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarPessoa } from "./pessoas";
import { hashPassword } from "@/lib/auth/password";
import { listarAcertos, registrarAcerto, registrarRepasse } from "./acertos";

beforeAll(async () => {
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

async function montarBase() {
  const household = await prismaTest.household.create({
    data: { nome: "Casa compartilhada" },
  });
  const isa = await criarPessoa(prismaTest, household.id, {
    nome: "Isa",
    tipo: "INDIVIDUAL",
  });
  const gabi = await criarPessoa(prismaTest, household.id, {
    nome: "Gabi",
    tipo: "INDIVIDUAL",
  });
  const passwordHash = await hashPassword("senha-de-teste-123");
  const user = await prismaTest.user.create({
    data: {
      email: `usuario-${Math.random()}@example.com`,
      nome: "Gabi",
      passwordHash,
      householdId: household.id,
    },
  });
  return { household, isa, gabi, user };
}

describe("registrarAcerto", () => {
  it("grava um AcertoContas por transferência sugerida", async () => {
    const { household, isa, gabi, user } = await montarBase();

    const criados = await registrarAcerto(prismaTest, household.id, {
      dataInicio: new Date(Date.UTC(2026, 0, 1)),
      dataFim: new Date(Date.UTC(2026, 0, 31)),
      transferencias: [
        { deId: gabi.id, paraId: isa.id, valorCentavos: 25_000 },
      ],
      resolvidoPorUserId: user.id,
    });

    expect(criados).toHaveLength(1);
    expect(criados[0].deId).toBe(gabi.id);
    expect(criados[0].paraId).toBe(isa.id);
    expect(criados[0].valorCentavos).toBe(25_000);
    expect(criados[0].resolvidoPorUserId).toBe(user.id);
  });

  it("não grava nada quando não há transferências (contas já quitadas)", async () => {
    const { household, user } = await montarBase();

    const criados = await registrarAcerto(prismaTest, household.id, {
      dataInicio: new Date(Date.UTC(2026, 0, 1)),
      dataFim: new Date(Date.UTC(2026, 0, 31)),
      transferencias: [],
      resolvidoPorUserId: user.id,
    });

    expect(criados).toEqual([]);
  });
});

describe("registrarRepasse", () => {
  it("grava um AcertoContas com dataInicio/dataFim iguais à data do repasse", async () => {
    const { household, isa, gabi, user } = await montarBase();
    const data = new Date(Date.UTC(2026, 0, 15));

    const criado = await registrarRepasse(prismaTest, household.id, {
      deId: gabi.id,
      paraId: isa.id,
      valorCentavos: 10_000_00,
      data,
      resolvidoPorUserId: user.id,
    });

    expect(criado).not.toBeNull();
    expect(criado?.deId).toBe(gabi.id);
    expect(criado?.paraId).toBe(isa.id);
    expect(criado?.valorCentavos).toBe(10_000_00);

    const historico = await prismaTest.acertoContas.findMany({
      where: { householdId: household.id },
    });
    expect(historico).toHaveLength(1);
    expect(historico[0].dataInicio).toEqual(historico[0].dataFim);
  });

  it("retorna null se deId não for uma pessoa Individual do household", async () => {
    const { household, isa, user } = await montarBase();
    const outraCasa = await prismaTest.household.create({
      data: { nome: `Outra casa ${Math.random()}` },
    });
    const forasteiro = await criarPessoa(prismaTest, outraCasa.id, {
      nome: "Forasteiro",
      tipo: "INDIVIDUAL",
    });

    const criado = await registrarRepasse(prismaTest, household.id, {
      deId: forasteiro.id,
      paraId: isa.id,
      valorCentavos: 1000,
      data: new Date(Date.UTC(2026, 0, 15)),
      resolvidoPorUserId: user.id,
    });

    expect(criado).toBeNull();
  });
});

describe("listarAcertos", () => {
  it("lista do mais recente para o mais antigo, escopado por household", async () => {
    const { household, isa, gabi, user } = await montarBase();
    const outraCasa = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });

    await registrarAcerto(prismaTest, household.id, {
      dataInicio: new Date(Date.UTC(2026, 0, 1)),
      dataFim: new Date(Date.UTC(2026, 0, 31)),
      transferencias: [
        { deId: gabi.id, paraId: isa.id, valorCentavos: 10_000 },
      ],
      resolvidoPorUserId: user.id,
    });
    await registrarAcerto(prismaTest, outraCasa.id, {
      dataInicio: new Date(Date.UTC(2026, 0, 1)),
      dataFim: new Date(Date.UTC(2026, 0, 31)),
      transferencias: [
        { deId: gabi.id, paraId: isa.id, valorCentavos: 99_000 },
      ],
      resolvidoPorUserId: user.id,
    });

    const acertos = await listarAcertos(prismaTest, household.id);
    expect(acertos).toHaveLength(1);
    expect(acertos[0].valorCentavos).toBe(10_000);
    expect(acertos[0].de.nome).toBe("Gabi");
    expect(acertos[0].para.nome).toBe("Isa");
  });
});
