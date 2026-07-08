import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarPessoa, definirIntegrantes } from "./pessoas";
import { criarCategoria } from "./categorias";
import { criarSubcategoria } from "./subcategorias";
import { criarBanco } from "./bancos";
import { criarLancamento } from "./lancamentos";
import { criarOrcamento } from "./orcamento";
import { criarReceita } from "./receitas";
import {
  buscarPlanejadoVsReal,
  buscarResumoPorCategoria,
  buscarResumoPorSubcategoria,
  buscarSaldo,
} from "./relatorios";

async function montarBase() {
  const household = await prismaTest.household.create({
    data: { nome: "Isa & Gabi" },
  });
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
  const banco = await criarBanco(prismaTest, household.id, {
    nome: "Nubank",
    tipo: "CONTA_CORRENTE",
  });
  return { household, isa, categoria, subcategoria: subcategoria!, banco };
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

describe("buscarPlanejadoVsReal", () => {
  it("busca orçamentos e lançamentos do household/ano e calcula planejado vs. real", async () => {
    const { household, isa, categoria, subcategoria, banco } =
      await montarBase();

    await criarOrcamento(prismaTest, household.id, {
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      mes: 1,
      ano: 2026,
      valorCentavos: 150_000,
    });
    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 10)),
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      valorCentavos: 100_000,
    });

    const resultado = await buscarPlanejadoVsReal(prismaTest, household.id, {
      ano: 2026,
    });

    expect(resultado).toHaveLength(1);
    expect(resultado[0].meses[0]).toMatchObject({
      mes: 1,
      planejadoCentavos: 150_000,
      realCentavos: 100_000,
      dentroDoPlanejado: true,
    });
  });

  it("usa o limite sugerido da subcategoria (Categorias & Orçamento) como base quando não há orçamento mensal definido", async () => {
    const { household, categoria } = await montarBase();
    const subLimite = await criarSubcategoria(prismaTest, household.id, {
      nome: "Supermercado",
      categoriaId: categoria.id,
      orcamentoCentavos: 50_000,
    });

    const resultado = await buscarPlanejadoVsReal(prismaTest, household.id, {
      ano: 2026,
    });

    const linha = resultado.find((r) => r.subcategoriaId === subLimite!.id)!;
    expect(linha.meses[0].planejadoCentavos).toBe(50_000);
    expect(linha.meses[11].planejadoCentavos).toBe(50_000);
  });

  it("um valor definido em um mês específico sobrepõe o limite sugerido a partir daquele mês, mantendo o limite antes dele", async () => {
    const { household, categoria } = await montarBase();
    const subLimite = await criarSubcategoria(prismaTest, household.id, {
      nome: "Supermercado",
      categoriaId: categoria.id,
      orcamentoCentavos: 50_000,
    });
    await criarOrcamento(prismaTest, household.id, {
      categoriaId: categoria.id,
      subcategoriaId: subLimite!.id,
      mes: 6,
      ano: 2026,
      valorCentavos: 70_000,
    });

    const resultado = await buscarPlanejadoVsReal(prismaTest, household.id, {
      ano: 2026,
    });

    const linha = resultado.find((r) => r.subcategoriaId === subLimite!.id)!;
    expect(linha.meses[0].planejadoCentavos).toBe(50_000); // jan: limite sugerido
    expect(linha.meses[4].planejadoCentavos).toBe(50_000); // mai: limite sugerido
    expect(linha.meses[5].planejadoCentavos).toBe(70_000); // jun: valor definido
    expect(linha.meses[11].planejadoCentavos).toBe(70_000); // dez: continua vigente
  });
});

describe("buscarResumoPorCategoria e buscarResumoPorSubcategoria", () => {
  it("agrega os lançamentos do ano por categoria e subcategoria", async () => {
    const { household, isa, categoria, subcategoria, banco } =
      await montarBase();

    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 2, 5)),
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      valorCentavos: 80_000,
    });

    const resumoCategorias = await buscarResumoPorCategoria(
      prismaTest,
      household.id,
      { ano: 2026 },
    );
    expect(resumoCategorias).toEqual([
      expect.objectContaining({
        categoriaId: categoria.id,
        totalCentavos: 80_000,
        percentualDoTotal: 100,
      }),
    ]);

    const resumoSubcategorias = await buscarResumoPorSubcategoria(
      prismaTest,
      household.id,
      { ano: 2026 },
    );
    expect(resumoSubcategorias).toEqual([
      expect.objectContaining({
        categoriaId: categoria.id,
        subcategoriaId: subcategoria.id,
        totalCentavos: 80_000,
      }),
    ]);
  });
});

describe("buscarSaldo", () => {
  it("calcula saldo do ano a partir de receitas e lançamentos reais", async () => {
    const { household, isa, categoria, subcategoria, banco } =
      await montarBase();

    await criarReceita(prismaTest, household.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 500_000,
      mes: new Date(Date.UTC(2026, 0, 1)),
    });
    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 20)),
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      valorCentavos: 200_000,
    });

    const saldo = await buscarSaldo(prismaTest, household.id, { ano: 2026 });

    expect(saldo.receitaCentavos).toBe(500_000);
    expect(saldo.despesaCentavos).toBe(200_000);
    expect(saldo.saldoCentavos).toBe(300_000);
    expect(saldo.porMes[0]).toMatchObject({
      mes: 1,
      receitaCentavos: 500_000,
      despesaCentavos: 200_000,
      saldoCentavos: 300_000,
    });
  });

  it("filtrando por pessoaId de um grupo, soma a receita dos integrantes", async () => {
    const household = await prismaTest.household.create({
      data: { nome: "Família com renda agregada" },
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
    await definirIntegrantes(prismaTest, household.id, familia.id, [
      { pessoaId: isa.id, peso: 100 },
      { pessoaId: gabi.id, peso: 100 },
    ]);

    await criarReceita(prismaTest, household.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 500_000,
      mes: new Date(Date.UTC(2026, 0, 1)),
    });
    await criarReceita(prismaTest, household.id, {
      pessoaId: gabi.id,
      subtipo: "SALARIO",
      valorCentavos: 300_000,
      mes: new Date(Date.UTC(2026, 0, 1)),
    });

    const saldoFamilia = await buscarSaldo(prismaTest, household.id, {
      ano: 2026,
      pessoaId: familia.id,
    });
    expect(saldoFamilia.receitaCentavos).toBe(800_000);

    const saldoIsa = await buscarSaldo(prismaTest, household.id, {
      ano: 2026,
      pessoaId: isa.id,
    });
    expect(saldoIsa.receitaCentavos).toBe(500_000);
  });
});
