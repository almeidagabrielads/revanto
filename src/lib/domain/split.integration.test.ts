import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarPessoa, definirIntegrantes } from "./pessoas";
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
  await definirIntegrantes(prismaTest, household.id, casal.id, [
    { pessoaId: isa.id, peso: 100 },
    { pessoaId: gabi.id, peso: 100 },
  ]);
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
      tipoGasto: "VARIAVEL",
      valorCentavos: 100_000,
    });

    const saldo = await buscarSaldoDivisaoGrupo(prismaTest, household.id, {});

    expect(saldo).not.toBeNull();
    expect(saldo!.participantes.sort()).toEqual([gabi.id, isa.id].sort());
    expect(saldo!.transferenciasSugeridas).toEqual([
      { deId: gabi.id, paraId: isa.id, valorCentavos: 50_000 },
    ]);
    expect(saldo!.gruposSemComposicao).toEqual([]);
  });

  it("filtra lançamentos pelo período informado", async () => {
    const { household, isa, gabi, categoria, banco } = await montarBase();

    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 10)),
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: gabi.id,
      tipoGasto: "VARIAVEL",
      valorCentavos: 10_000,
    });
    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 1, 10)),
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: gabi.id,
      tipoGasto: "VARIAVEL",
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
    await definirIntegrantes(prismaTest, household.id, casa.id, [
      { pessoaId: ana.id, peso: 100 },
      { pessoaId: bia.id, peso: 100 },
      { pessoaId: caio.id, peso: 100 },
    ]);
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
      tipoGasto: "VARIAVEL",
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
      tipoGasto: "VARIAVEL",
      valorCentavos: 300_00,
    });
    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 12)),
      categoriaId: lazer.id,
      bancoId: banco.id,
      pessoaDivisaoId: gabi.id,
      pessoaPagouId: gabi.id,
      tipoGasto: "VARIAVEL",
      valorCentavos: 50_00,
    });

    const saldo = await buscarSaldoDivisaoGrupo(prismaTest, household.id, {});

    expect(
      saldo!.totalPagoPorPessoa.sort((a, b) =>
        a.pessoaId.localeCompare(b.pessoaId),
      ),
    ).toEqual(
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

  it("usa o peso de cada integrante do grupo para ratear o gasto compartilhado (split customizado)", async () => {
    const household = await prismaTest.household.create({
      data: { nome: "Casa com split 70/30" },
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
    await definirIntegrantes(prismaTest, household.id, casal.id, [
      { pessoaId: isa.id, peso: 70 },
      { pessoaId: gabi.id, peso: 30 },
    ]);
    const categoria = await criarCategoria(prismaTest, household.id, {
      nome: "Moradia",
    });
    const banco = await criarBanco(prismaTest, household.id, {
      nome: "Nubank",
      tipo: "CONTA_CORRENTE",
    });

    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 10)),
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: casal.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
      valorCentavos: 100_000,
    });

    const saldo = await buscarSaldoDivisaoGrupo(prismaTest, household.id, {});

    // Isa pesa 70%, Gabi pesa 30% -> Gabi deve 30.000 (30% de 100.000) para Isa.
    expect(saldo!.transferenciasSugeridas).toEqual([
      { deId: gabi.id, paraId: isa.id, valorCentavos: 30_000 },
    ]);
  });

  it("desconta um acerto já resolvido cujo período está contido no período consultado", async () => {
    const { household, isa, gabi, casal, categoria, banco } =
      await montarBase();

    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 10)),
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: casal.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
      valorCentavos: 100_000,
    });
    // Bruto: Gabi deve 50.000 a Isa. Gabi já pagou 50.000 (acerto resolvido
    // em janeiro, mesmo mês dos lançamentos).
    await prismaTest.acertoContas.create({
      data: {
        householdId: household.id,
        dataInicio: new Date(Date.UTC(2026, 0, 1)),
        dataFim: new Date(Date.UTC(2026, 0, 31)),
        deId: gabi.id,
        paraId: isa.id,
        valorCentavos: 50_000,
      },
    });

    const saldoDoMes = await buscarSaldoDivisaoGrupo(prismaTest, household.id, {
      dataInicio: new Date(Date.UTC(2026, 0, 1)),
      dataFim: new Date(Date.UTC(2026, 0, 31)),
    });
    expect(saldoDoMes!.transferenciasSugeridas).toEqual([]);

    // Consultando um período maior que contém o acerto (ex.: "acumulado até
    // hoje"), o desconto continua valendo — a dívida paga não reaparece.
    const saldoAcumulado = await buscarSaldoDivisaoGrupo(
      prismaTest,
      household.id,
      { dataFim: new Date(Date.UTC(2026, 11, 31)) },
    );
    expect(saldoAcumulado!.transferenciasSugeridas).toEqual([]);
  });

  it("não desconta um acerto cujo período não está contido no período consultado", async () => {
    const { household, isa, gabi, casal, categoria, banco } =
      await montarBase();

    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 1, 10)),
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: casal.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
      valorCentavos: 100_000,
    });
    // Acerto resolvido em janeiro (mês sem lançamentos neste teste).
    await prismaTest.acertoContas.create({
      data: {
        householdId: household.id,
        dataInicio: new Date(Date.UTC(2026, 0, 1)),
        dataFim: new Date(Date.UTC(2026, 0, 31)),
        deId: gabi.id,
        paraId: isa.id,
        valorCentavos: 50_000,
      },
    });

    // Consultando só fevereiro, o acerto de janeiro fica fora do período e
    // não deve ser descontado do saldo de fevereiro.
    const saldoFevereiro = await buscarSaldoDivisaoGrupo(
      prismaTest,
      household.id,
      {
        dataInicio: new Date(Date.UTC(2026, 1, 1)),
        dataFim: new Date(Date.UTC(2026, 1, 28)),
      },
    );
    expect(saldoFevereiro!.transferenciasSugeridas).toEqual([
      { deId: gabi.id, paraId: isa.id, valorCentavos: 50_000 },
    ]);
  });

  it("sinaliza em gruposSemComposicao um grupo com lançamentos mas sem integrantes cadastrados", async () => {
    const household = await prismaTest.household.create({
      data: { nome: "Família recém-criada" },
    });
    const isa = await criarPessoa(prismaTest, household.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const gabi = await criarPessoa(prismaTest, household.id, {
      nome: "Gabi",
      tipo: "INDIVIDUAL",
    });
    const familia = await criarPessoa(prismaTest, household.id, {
      nome: "Família",
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
      data: new Date(Date.UTC(2026, 0, 10)),
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: familia.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
      valorCentavos: 100_000,
    });

    const saldo = await buscarSaldoDivisaoGrupo(prismaTest, household.id, {});

    // Sem integrantes cadastrados, o lançamento não gera acerto...
    expect(saldo!.transferenciasSugeridas).toEqual([]);
    expect(saldo!.saldosPorPessoa).toEqual(
      expect.arrayContaining([
        { pessoaId: isa.id, saldoCentavos: 0 },
        { pessoaId: gabi.id, saldoCentavos: 0 },
      ]),
    );
    // ...mas fica sinalizado, em vez de simplesmente sumir.
    expect(saldo!.gruposSemComposicao).toEqual([
      { pessoaId: familia.id, nome: "Família" },
    ]);
  });
});
