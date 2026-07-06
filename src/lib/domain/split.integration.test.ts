import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarPessoa } from "./pessoas";
import { criarCategoria } from "./categorias";
import { criarBanco } from "./bancos";
import { criarLancamento } from "./lancamentos";
import { buscarSaldoDivisaoGrupo } from "./split";

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
  const casal = await criarPessoa(prismaTest, household.id, {
    nome: "Casa",
    tipo: "CASAL",
  });
  const categoria = await criarCategoria(prismaTest, household.id, {
    nome: "Moradia",
  });
  const banco = await criarBanco(prismaTest, household.id, {
    nome: "Nubank",
    tipo: "CONTA_CORRENTE",
  });
  return { household, isa, gabi, casal, categoria, banco };
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

describe("buscarSaldoDivisaoGrupo", () => {
  it("detecta automaticamente todas as pessoas INDIVIDUAL do household e calcula o saldo", async () => {
    const { household, isa, gabi, casal, categoria, banco } =
      await montarBase();

    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 10)),
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: casal.id,
      pessoaPagouId: isa.id,
      valorCentavos: 100_000,
    });

    const saldo = await buscarSaldoDivisaoGrupo(prismaTest, household.id, {});

    expect(saldo).not.toBeNull();
    expect(saldo!.participantes.sort()).toEqual([gabi.id, isa.id].sort());
    expect(saldo!.transferenciasSugeridas).toEqual([
      { deId: gabi.id, paraId: isa.id, valorCentavos: 50_000 },
    ]);
  });

  it("filtra lançamentos pelo período informado", async () => {
    const { household, isa, gabi, categoria, banco } = await montarBase();

    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 10)),
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: gabi.id,
      valorCentavos: 10_000,
    });
    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 1, 10)),
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: gabi.id,
      valorCentavos: 20_000,
    });

    const saldo = await buscarSaldoDivisaoGrupo(prismaTest, household.id, {
      dataInicio: new Date(Date.UTC(2026, 0, 1)),
      dataFim: new Date(Date.UTC(2026, 0, 31)),
    });

    expect(saldo!.transferenciasSugeridas).toEqual([
      { deId: isa.id, paraId: gabi.id, valorCentavos: 10_000 },
    ]);
  });

  it("retorna null quando o household não tem ao menos duas pessoas INDIVIDUAL (ex.: mora sozinho)", async () => {
    const household = await prismaTest.household.create({
      data: { nome: "Mora sozinho" },
    });
    await criarPessoa(prismaTest, household.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });

    const saldo = await buscarSaldoDivisaoGrupo(prismaTest, household.id, {});

    expect(saldo).toBeNull();
  });

  it("calcula o acerto para uma república com 3 pessoas", async () => {
    const household = await prismaTest.household.create({
      data: { nome: "República" },
    });
    const ana = await criarPessoa(prismaTest, household.id, {
      nome: "Ana",
      tipo: "INDIVIDUAL",
    });
    const bia = await criarPessoa(prismaTest, household.id, {
      nome: "Bia",
      tipo: "INDIVIDUAL",
    });
    const caio = await criarPessoa(prismaTest, household.id, {
      nome: "Caio",
      tipo: "INDIVIDUAL",
    });
    const casa = await criarPessoa(prismaTest, household.id, {
      nome: "Casa",
      tipo: "FAMILIA",
    });
    const categoria = await criarCategoria(prismaTest, household.id, {
      nome: "Moradia",
    });
    const banco = await criarBanco(prismaTest, household.id, {
      nome: "Nubank",
      tipo: "CONTA_CORRENTE",
    });

    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 5)),
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: casa.id,
      pessoaPagouId: ana.id,
      valorCentavos: 90_000,
    });

    const saldo = await buscarSaldoDivisaoGrupo(prismaTest, household.id, {});

    expect(saldo!.participantes.sort()).toEqual(
      [ana.id, bia.id, caio.id].sort(),
    );
    const total = saldo!.transferenciasSugeridas.reduce(
      (s, t) => s + t.valorCentavos,
      0,
    );
    expect(total).toBe(60_000); // Ana pagou pelos outros 2 (30.000 cada)
  });

  it("calcula totalPagoPorPessoa, lançamentos detalhados e insight de categoria", async () => {
    const { household, isa, gabi, categoria, banco } = await montarBase();
    const lazer = await criarCategoria(prismaTest, household.id, {
      nome: "Lazer",
    });

    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 10)),
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      valorCentavos: 300_00,
    });
    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 12)),
      categoriaId: lazer.id,
      bancoId: banco.id,
      pessoaDivisaoId: gabi.id,
      pessoaPagouId: gabi.id,
      valorCentavos: 50_00,
    });

    const saldo = await buscarSaldoDivisaoGrupo(prismaTest, household.id, {});

    expect(saldo!.totalPagoPorPessoa.sort((a, b) => a.pessoaId.localeCompare(b.pessoaId))).toEqual(
      [
        { pessoaId: gabi.id, totalCentavos: 50_00 },
        { pessoaId: isa.id, totalCentavos: 300_00 },
      ].sort((a, b) => a.pessoaId.localeCompare(b.pessoaId)),
    );
    expect(saldo!.lancamentos).toHaveLength(2);
    expect(saldo!.insight).toEqual({
      categoriaNome: "Moradia",
      pessoaId: isa.id,
    });
  });
});
