import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarPessoa, definirIntegrantes } from "./pessoas";
import { criarCategoria } from "./categorias";
import { criarSubcategoria } from "./subcategorias";
import { criarBanco } from "./bancos";
import { criarLancamento } from "./lancamentos";
import { criarOrcamento } from "./orcamento";
import { criarReceita } from "./receitas";
import { criarPosicaoPatrimonio } from "./patrimonio";
import { buscarRelatorioAnual } from "./relatorioAnual";

async function montarBase() {
  const household = await prismaTest.household.create({
    data: { nome: "Isa & Gabi" },
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
    nome: "Casal",
    tipo: "CASAL",
  });
  await definirIntegrantes(prismaTest, household.id, casal.id, [
    { pessoaId: isa.id, peso: 100 },
    { pessoaId: gabi.id, peso: 100 },
  ]);
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
  return {
    household,
    isa,
    gabi,
    casal,
    categoria,
    subcategoria: subcategoria!,
    banco,
  };
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

describe("buscarRelatorioAnual", () => {
  it("consolida orçamento planejado x real por pessoa/família, saldo, patrimônio e divisão do ano", async () => {
    const { household, isa, gabi, casal, categoria, subcategoria, banco } =
      await montarBase();

    // Orçamento: um do casal/família e um específico da Isa.
    await criarOrcamento(prismaTest, household.id, {
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      mes: 1,
      ano: 2026,
      valorCentavos: 150_000,
    });
    await criarOrcamento(prismaTest, household.id, {
      pessoaId: isa.id,
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      mes: 1,
      ano: 2026,
      valorCentavos: 50_000,
    });

    // Lançamentos: um em nome do casal (pago pela Isa) e outro individual da Isa.
    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 5)),
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: casal.id,
      pessoaPagouId: isa.id,
      valorCentavos: 200_000,
    });
    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 10)),
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      valorCentavos: 40_000,
    });

    await criarReceita(prismaTest, household.id, {
      pessoaId: isa.id,
      subtipo: "SALARIO",
      valorCentavos: 500_000,
      mes: new Date(Date.UTC(2026, 0, 1)),
    });

    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      pessoaId: isa.id,
      mes: new Date(Date.UTC(2026, 0, 1)),
      valorCentavos: 1_000_000,
    });
    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      pessoaId: gabi.id,
      mes: new Date(Date.UTC(2026, 0, 1)),
      valorCentavos: 500_000,
    });
    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      pessoaId: isa.id,
      mes: new Date(Date.UTC(2026, 1, 1)),
      valorCentavos: 1_100_000,
    });

    const relatorio = await buscarRelatorioAnual(prismaTest, household.id, {
      ano: 2026,
    });

    expect(relatorio.ano).toBe(2026);

    // Saldo do ano: receita 500_000 - despesa (200_000 + 40_000).
    expect(relatorio.saldo.receitaCentavos).toBe(500_000);
    expect(relatorio.saldo.despesaCentavos).toBe(240_000);
    expect(relatorio.saldo.saldoCentavos).toBe(260_000);

    // Planejado vs. real: uma seção por pessoa individual + uma do casal/família.
    const labels = relatorio.planejadoVsReal.map((s) => s.label).sort();
    expect(labels).toEqual(["Compartilhado", "Gabi", "Isa"]);

    // A seção "Família" reflete o orçamento do casal (pessoaId nulo), mas o
    // real considera todos os lançamentos do household no período (pessoaId
    // nulo = sem filtro, mesma semântica de buscarPlanejadoVsReal).
    const secaoFamilia = relatorio.planejadoVsReal.find(
      (s) => s.pessoaId === null,
    )!;
    expect(secaoFamilia.itens[0].meses[0]).toMatchObject({
      mes: 1,
      planejadoCentavos: 150_000,
      realCentavos: 240_000,
      dentroDoPlanejado: false,
    });

    // O real de Isa passa a incluir a fração dela no gasto do casal (50% de
    // 200_000 = 100_000, já que Isa/Gabi têm peso igual) além do lançamento
    // individual dela (40_000) -> 140_000.
    const secaoIsa = relatorio.planejadoVsReal.find(
      (s) => s.pessoaId === isa.id,
    )!;
    expect(secaoIsa.itens[0].meses[0]).toMatchObject({
      mes: 1,
      planejadoCentavos: 50_000,
      realCentavos: 140_000,
      dentroDoPlanejado: false,
    });

    // Resumo por categoria/subcategoria: soma de todos os lançamentos do ano.
    expect(relatorio.resumoPorCategoria).toEqual([
      expect.objectContaining({
        categoriaId: categoria.id,
        totalCentavos: 240_000,
      }),
    ]);
    expect(relatorio.resumoPorSubcategoria).toEqual([
      expect.objectContaining({
        categoriaId: categoria.id,
        subcategoriaId: subcategoria.id,
        totalCentavos: 240_000,
      }),
    ]);

    // Evolução de patrimônio total: soma Isa+Gabi em jan, só Isa em fev.
    expect(relatorio.evolucaoPatrimonio).toHaveLength(2);
    expect(relatorio.evolucaoPatrimonio[0].valorCentavos).toBe(1_500_000);
    expect(relatorio.evolucaoPatrimonio[1].valorCentavos).toBe(1_100_000);

    // Divisão de despesas: gasto do casal de 200_000, Isa pagou -> deve 100_000 a menos
    // (Gabi deve 100_000 para Isa).
    expect(relatorio.divisaoDespesas).not.toBeNull();
    expect(relatorio.divisaoDespesas!.transferenciasSugeridas).toEqual([
      { deId: gabi.id, paraId: isa.id, valorCentavos: 100_000 },
    ]);
  });

  it("filtra por pessoa individual, ratando a fração dela nos gastos do grupo", async () => {
    const { household, isa, categoria, subcategoria, banco } =
      await montarBase();

    await criarOrcamento(prismaTest, household.id, {
      pessoaId: isa.id,
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      mes: 1,
      ano: 2026,
      valorCentavos: 50_000,
    });

    const casal = await prismaTest.pessoa.findFirstOrThrow({
      where: { householdId: household.id, tipo: "CASAL" },
    });

    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 5)),
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: casal.id,
      pessoaPagouId: isa.id,
      valorCentavos: 200_000,
    });
    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 10)),
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      valorCentavos: 40_000,
    });

    const relatorio = await buscarRelatorioAnual(prismaTest, household.id, {
      ano: 2026,
      pessoaId: isa.id,
    });

    // 50% de 200_000 (fração da Isa no casal, peso igual) + 40_000 direto = 140_000.
    expect(relatorio.saldo.despesaCentavos).toBe(140_000);
    expect(relatorio.resumoPorCategoria).toEqual([
      expect.objectContaining({
        categoriaId: categoria.id,
        totalCentavos: 140_000,
      }),
    ]);
    expect(relatorio.planejadoVsReal).toHaveLength(1);
    expect(relatorio.planejadoVsReal[0]).toMatchObject({
      pessoaId: isa.id,
      label: "Isa",
    });
    expect(relatorio.planejadoVsReal[0].itens[0].meses[0]).toMatchObject({
      planejadoCentavos: 50_000,
      realCentavos: 140_000,
    });
  });

  it("filtra por grupo (CASAL/FAMILIA) trazendo o valor cheio, sem fração", async () => {
    const { household, isa, categoria, subcategoria, banco } =
      await montarBase();
    const casal = await prismaTest.pessoa.findFirstOrThrow({
      where: { householdId: household.id, tipo: "CASAL" },
    });

    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 5)),
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: casal.id,
      pessoaPagouId: isa.id,
      valorCentavos: 200_000,
    });
    await criarLancamento(prismaTest, household.id, {
      data: new Date(Date.UTC(2026, 0, 10)),
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      valorCentavos: 40_000,
    });

    const relatorio = await buscarRelatorioAnual(prismaTest, household.id, {
      ano: 2026,
      pessoaId: casal.id,
    });

    // Só o gasto do próprio grupo, valor cheio (sem os 40_000 individuais da Isa).
    expect(relatorio.saldo.despesaCentavos).toBe(200_000);
    expect(relatorio.planejadoVsReal).toHaveLength(1);
    expect(relatorio.planejadoVsReal[0]).toMatchObject({
      pessoaId: casal.id,
      label: "Casal",
    });
    expect(relatorio.planejadoVsReal[0].itens[0].meses[0]).toMatchObject({
      realCentavos: 200_000,
    });
  });

  it("omite a divisão de despesas quando o household não tem duas pessoas individuais", async () => {
    const household = await prismaTest.household.create({
      data: { nome: "Sem casal" },
    });
    await criarPessoa(prismaTest, household.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });

    const relatorio = await buscarRelatorioAnual(prismaTest, household.id, {
      ano: 2026,
    });

    expect(relatorio.divisaoDespesas).toBeNull();
    expect(relatorio.evolucaoPatrimonio).toEqual([]);
    expect(relatorio.planejadoVsReal.map((s) => s.label)).toEqual([
      "Isa",
      "Compartilhado",
    ]);
  });
});
