import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarPessoa } from "./pessoas";
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
});
