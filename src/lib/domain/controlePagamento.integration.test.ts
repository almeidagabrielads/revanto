import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarPessoa } from "./pessoas";
import { buscarControlePagamento } from "./controlePagamento";

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
    data: { nome: `Casa ${Math.random()}` },
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
  const categoria = await prismaTest.categoria.create({
    data: { nome: "Moradia", householdId: household.id },
  });
  const banco = await prismaTest.banco.create({
    data: { nome: "Nubank", tipo: "CONTA_CORRENTE", householdId: household.id },
  });
  return { household, isa, gabi, familia, categoria, banco };
}

describe("buscarControlePagamento", () => {
  it("soma lançamentos por divisão x pagador dentro do período, por mês", async () => {
    const { household, isa, gabi, familia, categoria, banco } = await montarBase();

    await prismaTest.lancamento.create({
      data: {
        data: new Date(Date.UTC(2026, 0, 10)),
        valorCentavos: 10_000,
        descontoCentavos: 1_000,
        householdId: household.id,
        categoriaId: categoria.id,
        bancoId: banco.id,
        pessoaDivisaoId: familia.id,
        pessoaPagouId: gabi.id,
      },
    });
    await prismaTest.lancamento.create({
      data: {
        data: new Date(Date.UTC(2026, 1, 5)),
        valorCentavos: 5_000,
        householdId: household.id,
        categoriaId: categoria.id,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: gabi.id,
      },
    });

    const resultado = await buscarControlePagamento(prismaTest, household.id, {
      dataInicio: new Date(Date.UTC(2026, 0, 1)),
      dataFim: new Date(Date.UTC(2026, 1, 28)),
    });

    expect(resultado.meses).toEqual(["2026-01", "2026-02"]);
    expect(resultado.pagadores.map((p) => p.nome)).toEqual(["Gabi", "Isa"]);
    expect(resultado.pessoasDivisao.map((p) => p.nome)).toEqual([
      "Família",
      "Gabi",
      "Isa",
    ]);
    // 3 divisões x 2 pagadores = 6 linhas, mesmo sem dado em todas
    expect(resultado.linhas).toHaveLength(6);

    const familiaPorGabi = resultado.linhas.find(
      (l) => l.divisaoId === familia.id && l.pagadorId === gabi.id,
    );
    expect(familiaPorGabi?.porMes["2026-01"]).toBe(9_000);
    expect(familiaPorGabi?.porMes["2026-02"]).toBe(0);

    const isaPorGabi = resultado.linhas.find(
      (l) => l.divisaoId === isa.id && l.pagadorId === gabi.id,
    );
    expect(isaPorGabi?.porMes["2026-02"]).toBe(5_000);

    const gabiPorIsa = resultado.linhas.find(
      (l) => l.divisaoId === gabi.id && l.pagadorId === isa.id,
    );
    expect(gabiPorIsa?.porMes["2026-01"]).toBe(0);
    expect(gabiPorIsa?.porMes["2026-02"]).toBe(0);
  });

  it("pagouPor inclui a fatia da outra pessoa nos gastos de grupo, rateada por peso", async () => {
    const { household, isa, gabi, familia, categoria, banco } = await montarBase();
    await prismaTest.integranteGrupo.createMany({
      data: [
        { grupoId: familia.id, pessoaId: isa.id, peso: 1, householdId: household.id },
        { grupoId: familia.id, pessoaId: gabi.id, peso: 1, householdId: household.id },
      ],
    });

    // Gabi paga R$ 90,00 líquidos da Família (metade da Isa: R$ 45,00)
    await prismaTest.lancamento.create({
      data: {
        data: new Date(Date.UTC(2026, 0, 10)),
        valorCentavos: 10_000,
        descontoCentavos: 1_000,
        householdId: household.id,
        categoriaId: categoria.id,
        bancoId: banco.id,
        pessoaDivisaoId: familia.id,
        pessoaPagouId: gabi.id,
      },
    });
    // Gabi também paga R$ 50,00 de um gasto individual da Isa
    await prismaTest.lancamento.create({
      data: {
        data: new Date(Date.UTC(2026, 0, 12)),
        valorCentavos: 5_000,
        householdId: household.id,
        categoriaId: categoria.id,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: gabi.id,
      },
    });

    const resultado = await buscarControlePagamento(prismaTest, household.id, {
      dataInicio: new Date(Date.UTC(2026, 0, 1)),
      dataFim: new Date(Date.UTC(2026, 0, 31)),
    });

    const gabiPelaIsa = resultado.pagouPor.find(
      (l) => l.pessoaId === isa.id && l.pagadorId === gabi.id,
    );
    expect(gabiPelaIsa?.porMes["2026-01"]).toBe(4_500 + 5_000);

    // A própria fatia da Gabi no grupo não conta como "pago pela Isa" nem
    // aparece na direção inversa
    const isaPelaGabi = resultado.pagouPor.find(
      (l) => l.pessoaId === gabi.id && l.pagadorId === isa.id,
    );
    expect(isaPelaGabi?.porMes["2026-01"]).toBe(0);
  });

  it("gastoTotal segue a regra do dashboard: divisão própria + fração nos grupos, sem repasses", async () => {
    const { household, isa, gabi, familia, categoria, banco } = await montarBase();
    await prismaTest.integranteGrupo.createMany({
      data: [
        { grupoId: familia.id, pessoaId: isa.id, peso: 1, householdId: household.id },
        { grupoId: familia.id, pessoaId: gabi.id, peso: 1, householdId: household.id },
      ],
    });

    // Gasto da Família de R$ 90,00 líquidos (fração de cada uma: R$ 45,00),
    // pago pela Gabi — quem pagou não importa para o gasto total
    await prismaTest.lancamento.create({
      data: {
        data: new Date(Date.UTC(2026, 0, 10)),
        valorCentavos: 10_000,
        descontoCentavos: 1_000,
        householdId: household.id,
        categoriaId: categoria.id,
        bancoId: banco.id,
        pessoaDivisaoId: familia.id,
        pessoaPagouId: gabi.id,
      },
    });
    // Gasto individual da Isa de R$ 50,00, pago pela Gabi
    await prismaTest.lancamento.create({
      data: {
        data: new Date(Date.UTC(2026, 0, 12)),
        valorCentavos: 5_000,
        householdId: household.id,
        categoriaId: categoria.id,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: gabi.id,
      },
    });
    // Repasse não entra no gasto total
    await prismaTest.acertoContas.create({
      data: {
        householdId: household.id,
        dataInicio: new Date(Date.UTC(2026, 0, 20)),
        dataFim: new Date(Date.UTC(2026, 0, 20)),
        deId: gabi.id,
        paraId: isa.id,
        valorCentavos: 100_000,
      },
    });

    const resultado = await buscarControlePagamento(prismaTest, household.id, {
      dataInicio: new Date(Date.UTC(2026, 0, 1)),
      dataFim: new Date(Date.UTC(2026, 0, 31)),
    });

    const gastoIsa = resultado.gastoTotal.find((g) => g.pessoaId === isa.id);
    expect(gastoIsa?.porMes["2026-01"]).toBe(4_500 + 5_000);

    const gastoGabi = resultado.gastoTotal.find((g) => g.pessoaId === gabi.id);
    expect(gastoGabi?.porMes["2026-01"]).toBe(4_500);
  });

  it("soma repasses tratando deId como pagador e paraId como divisão", async () => {
    const { household, isa, gabi } = await montarBase();

    await prismaTest.acertoContas.create({
      data: {
        householdId: household.id,
        dataInicio: new Date(Date.UTC(2026, 0, 15)),
        dataFim: new Date(Date.UTC(2026, 0, 15)),
        deId: gabi.id,
        paraId: isa.id,
        valorCentavos: 100_000,
      },
    });

    const resultado = await buscarControlePagamento(prismaTest, household.id, {
      dataInicio: new Date(Date.UTC(2026, 0, 1)),
      dataFim: new Date(Date.UTC(2026, 0, 31)),
    });

    const isaPorGabi = resultado.linhas.find(
      (l) => l.divisaoId === isa.id && l.pagadorId === gabi.id,
    );
    expect(isaPorGabi?.porMes["2026-01"]).toBe(100_000);
  });

  it("ignora lançamentos e repasses fora do período consultado", async () => {
    const { household, isa, gabi, categoria, banco } = await montarBase();

    await prismaTest.lancamento.create({
      data: {
        data: new Date(Date.UTC(2025, 11, 31)),
        valorCentavos: 1_000,
        householdId: household.id,
        categoriaId: categoria.id,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: gabi.id,
      },
    });

    const resultado = await buscarControlePagamento(prismaTest, household.id, {
      dataInicio: new Date(Date.UTC(2026, 0, 1)),
      dataFim: new Date(Date.UTC(2026, 0, 31)),
    });

    const isaPorGabi = resultado.linhas.find(
      (l) => l.divisaoId === isa.id && l.pagadorId === gabi.id,
    );
    expect(isaPorGabi?.porMes["2026-01"]).toBe(0);
  });

  it("acumula todos os tempos quando dataInicio/dataFim não são informados, cobrindo do registro mais antigo ao mais recente", async () => {
    const { household, isa, gabi, categoria, banco } = await montarBase();

    await prismaTest.lancamento.create({
      data: {
        data: new Date(Date.UTC(2024, 5, 1)),
        valorCentavos: 3_000,
        householdId: household.id,
        categoriaId: categoria.id,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: gabi.id,
      },
    });
    await prismaTest.acertoContas.create({
      data: {
        householdId: household.id,
        dataInicio: new Date(Date.UTC(2026, 2, 10)),
        dataFim: new Date(Date.UTC(2026, 2, 10)),
        deId: isa.id,
        paraId: gabi.id,
        valorCentavos: 7_000,
      },
    });

    const resultado = await buscarControlePagamento(prismaTest, household.id);

    expect(resultado.meses[0]).toBe("2024-06");
    expect(resultado.meses.at(-1)).toBe("2026-03");

    const isaPorGabi = resultado.linhas.find(
      (l) => l.divisaoId === isa.id && l.pagadorId === gabi.id,
    );
    expect(isaPorGabi?.porMes["2024-06"]).toBe(3_000);

    const gabiPorIsa = resultado.linhas.find(
      (l) => l.divisaoId === gabi.id && l.pagadorId === isa.id,
    );
    expect(gabiPorIsa?.porMes["2026-03"]).toBe(7_000);
  });
});
