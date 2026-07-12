import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarCategoria } from "./categorias";
import { criarSubcategoria } from "./subcategorias";
import { criarBanco } from "./bancos";
import { criarPessoa, definirIntegrantes } from "./pessoas";
import { criarInvestimento } from "./investimentos";
import {
  atualizarLancamento,
  buscarLancamento,
  buscarSugestoesDescricao,
  criarLancamento,
  listarLancamentos,
  removerLancamento,
} from "./lancamentos";

async function criarHousehold(nome = "Isa & Gabi") {
  return prismaTest.household.create({ data: { nome } });
}

async function montarCadastros(householdId: string) {
  const categoria = await criarCategoria(prismaTest, householdId, {
    nome: "Casa",
  });
  const subcategoriaOuNula = await criarSubcategoria(prismaTest, householdId, {
    nome: "Energia",
    categoriaId: categoria.id,
  });
  if (!subcategoriaOuNula)
    throw new Error("falha ao montar cadastros de teste");
  const subcategoria = subcategoriaOuNula;
  const banco = await criarBanco(prismaTest, householdId, {
    nome: "Nubank",
    tipo: "CARTAO_CREDITO",
  });
  const isa = await criarPessoa(prismaTest, householdId, {
    nome: "Isa",
    tipo: "INDIVIDUAL",
  });
  const gabi = await criarPessoa(prismaTest, householdId, {
    nome: "Gabi",
    tipo: "INDIVIDUAL",
  });
  return { categoria, subcategoria, banco, isa, gabi };
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

describe("criarLancamento", () => {
  it("cria lançamento vinculado ao household com todos os campos", async () => {
    const h = await criarHousehold();
    const { categoria, subcategoria, banco, isa, gabi } = await montarCadastros(
      h.id,
    );

    const lancamento = await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      descricaoOrigem: "SUPERMERCADO XYZ",
      descricaoPropria: "Mercado do mês",
      valorCentavos: 15000,
      descontoCentavos: 500,
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: gabi.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    expect(lancamento).not.toBeNull();
    expect(lancamento?.householdId).toBe(h.id);
    expect(lancamento?.valorCentavos).toBe(15000);
    expect(lancamento?.descontoCentavos).toBe(500);
    expect(lancamento?.pessoaDivisaoId).toBe(gabi.id);
    expect(lancamento?.pessoaPagouId).toBe(isa.id);
  });

  it("aceita valor negativo (estorno)", async () => {
    const h = await criarHousehold();
    const { banco, isa } = await montarCadastros(h.id);

    const lancamento = await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      valorCentavos: -5000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    expect(lancamento?.valorCentavos).toBe(-5000);
  });

  it("retorna null se subcategoria não pertence à categoria informada", async () => {
    const h = await criarHousehold();
    const { subcategoria, banco, isa } = await montarCadastros(h.id);
    const outraCategoria = await criarCategoria(prismaTest, h.id, {
      nome: "Viagem",
    });

    const lancamento = await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      valorCentavos: 1000,
      categoriaId: outraCategoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    expect(lancamento).toBeNull();
  });

  it("retorna null se subcategoria informada sem categoria", async () => {
    const h = await criarHousehold();
    const { subcategoria, banco, isa } = await montarCadastros(h.id);

    const lancamento = await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      valorCentavos: 1000,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    expect(lancamento).toBeNull();
  });

  it("retorna null se banco pertence a outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const { isa } = await montarCadastros(h1.id);
    const bancoDeOutraCasa = await criarBanco(prismaTest, h2.id, {
      nome: "Itaú",
      tipo: "CONTA_CORRENTE",
    });

    const lancamento = await criarLancamento(prismaTest, h1.id, {
      data: new Date("2026-06-10"),
      valorCentavos: 1000,
      bancoId: bancoDeOutraCasa.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    expect(lancamento).toBeNull();
  });

  it("aceita marcação de pago com resgate de investimento (sem selecionar qual)", async () => {
    const h = await criarHousehold();
    const { banco, isa } = await montarCadastros(h.id);

    const lancamento = await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      valorCentavos: 1000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
      pagoComResgateInvestimento: true,
    });

    expect(lancamento?.pagoComResgateInvestimento).toBe(true);
    expect(lancamento?.investimentoResgateId).toBeNull();
  });

  it("aceita marcação de pago com resgate de investimento com o investimento selecionado", async () => {
    const h = await criarHousehold();
    const { banco, isa } = await montarCadastros(h.id);
    const investimento = await criarInvestimento(prismaTest, h.id, {
      bancoId: banco.id,
      tipo: "RENDA_FIXA",
      produto: "CDB Banco X",
      valorAtualCentavos: 100000,
      pessoaId: isa.id,
    });
    if (!investimento) throw new Error("falha ao criar investimento de teste");

    const lancamento = await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      valorCentavos: 1000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
      pagoComResgateInvestimento: true,
      investimentoResgateId: investimento.id,
    });

    expect(lancamento?.pagoComResgateInvestimento).toBe(true);
    expect(lancamento?.investimentoResgateId).toBe(investimento.id);
  });

  it("retorna null se investimento selecionado pertence a outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const { banco, isa } = await montarCadastros(h1.id);
    const bancoOutraCasa = await criarBanco(prismaTest, h2.id, {
      nome: "Itaú",
      tipo: "CONTA_CORRENTE",
    });
    const pessoaOutraCasa = await criarPessoa(prismaTest, h2.id, {
      nome: "Zeca",
      tipo: "INDIVIDUAL",
    });
    const investimentoDeOutraCasa = await criarInvestimento(prismaTest, h2.id, {
      bancoId: bancoOutraCasa.id,
      tipo: "RENDA_FIXA",
      produto: "CDB Banco Y",
      valorAtualCentavos: 50000,
      pessoaId: pessoaOutraCasa.id,
    });
    if (!investimentoDeOutraCasa)
      throw new Error("falha ao criar investimento de teste");

    const lancamento = await criarLancamento(prismaTest, h1.id, {
      data: new Date("2026-06-10"),
      valorCentavos: 1000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
      pagoComResgateInvestimento: true,
      investimentoResgateId: investimentoDeOutraCasa.id,
    });

    expect(lancamento).toBeNull();
  });
});

describe("atualizarLancamento", () => {
  it("atualiza campos simples mantendo referências existentes", async () => {
    const h = await criarHousehold();
    const { categoria, subcategoria, banco, isa } = await montarCadastros(h.id);
    const lancamento = await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      valorCentavos: 1000,
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    const atualizado = await atualizarLancamento(
      prismaTest,
      h.id,
      lancamento!.id,
      { valorCentavos: 2500 },
    );

    expect(atualizado?.valorCentavos).toBe(2500);
    expect(atualizado?.subcategoriaId).toBe(subcategoria.id);
  });

  it("retorna null ao trocar categoria deixando subcategoria antiga incompatível", async () => {
    const h = await criarHousehold();
    const { categoria, subcategoria, banco, isa } = await montarCadastros(h.id);
    const outraCategoria = await criarCategoria(prismaTest, h.id, {
      nome: "Viagem",
    });
    const lancamento = await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      valorCentavos: 1000,
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    const atualizado = await atualizarLancamento(
      prismaTest,
      h.id,
      lancamento!.id,
      { categoriaId: outraCategoria.id },
    );

    expect(atualizado).toBeNull();
  });

  it("retorna null para lançamento inexistente", async () => {
    const h = await criarHousehold();
    const atualizado = await atualizarLancamento(prismaTest, h.id, "id-fake", {
      valorCentavos: 100,
    });
    expect(atualizado).toBeNull();
  });

  it("marca e desmarca pago com resgate de investimento", async () => {
    const h = await criarHousehold();
    const { banco, isa } = await montarCadastros(h.id);
    const investimento = await criarInvestimento(prismaTest, h.id, {
      bancoId: banco.id,
      tipo: "RENDA_FIXA",
      produto: "CDB Banco X",
      valorAtualCentavos: 100000,
      pessoaId: isa.id,
    });
    if (!investimento) throw new Error("falha ao criar investimento de teste");
    const lancamento = await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      valorCentavos: 1000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    const marcado = await atualizarLancamento(
      prismaTest,
      h.id,
      lancamento!.id,
      {
        pagoComResgateInvestimento: true,
        investimentoResgateId: investimento.id,
      },
    );
    expect(marcado?.pagoComResgateInvestimento).toBe(true);
    expect(marcado?.investimentoResgateId).toBe(investimento.id);

    const desmarcado = await atualizarLancamento(
      prismaTest,
      h.id,
      lancamento!.id,
      { pagoComResgateInvestimento: false, investimentoResgateId: null },
    );
    expect(desmarcado?.pagoComResgateInvestimento).toBe(false);
    expect(desmarcado?.investimentoResgateId).toBeNull();
  });
});

describe("removerLancamento", () => {
  it("remove fisicamente o lançamento", async () => {
    const h = await criarHousehold();
    const { banco, isa } = await montarCadastros(h.id);
    const lancamento = await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      valorCentavos: 1000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    const removido = await removerLancamento(prismaTest, h.id, lancamento!.id);
    expect(removido).not.toBeNull();

    const buscado = await prismaTest.lancamento.findUnique({
      where: { id: lancamento!.id },
    });
    expect(buscado).toBeNull();
  });
});

describe("buscarLancamento", () => {
  it("não retorna lançamento de outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const { banco, isa } = await montarCadastros(h1.id);
    const lancamento = await criarLancamento(prismaTest, h1.id, {
      data: new Date("2026-06-10"),
      valorCentavos: 1000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    const resultado = await buscarLancamento(prismaTest, h2.id, lancamento!.id);
    expect(resultado).toBeNull();
  });
});

describe("listarLancamentos (filtros)", () => {
  it("filtra por período", async () => {
    const h = await criarHousehold();
    const { banco, isa } = await montarCadastros(h.id);
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-05-15"),
      valorCentavos: 1000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-15"),
      valorCentavos: 2000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    const lancamentos = await listarLancamentos(prismaTest, h.id, {
      dataInicio: new Date("2026-06-01"),
      dataFim: new Date("2026-06-30"),
    });

    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0].valorCentavos).toBe(2000);
  });

  it("filtra por categoria", async () => {
    const h = await criarHousehold();
    const { categoria, banco, isa } = await montarCadastros(h.id);
    const outraCategoria = await criarCategoria(prismaTest, h.id, {
      nome: "Viagem",
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-01"),
      valorCentavos: 1000,
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-02"),
      valorCentavos: 2000,
      categoriaId: outraCategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    const lancamentos = await listarLancamentos(prismaTest, h.id, {
      categoriaId: categoria.id,
    });

    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0].valorCentavos).toBe(1000);
  });

  it("filtra por pessoa (dona da divisão ou quem pagou)", async () => {
    const h = await criarHousehold();
    const { banco, isa, gabi } = await montarCadastros(h.id);
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-01"),
      valorCentavos: 1000,
      bancoId: banco.id,
      pessoaDivisaoId: gabi.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-02"),
      valorCentavos: 2000,
      bancoId: banco.id,
      pessoaDivisaoId: gabi.id,
      pessoaPagouId: gabi.id,
      tipoGasto: "VARIAVEL",
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-03"),
      valorCentavos: 3000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    const lancamentos = await listarLancamentos(prismaTest, h.id, {
      pessoaId: isa.id,
    });

    expect(lancamentos).toHaveLength(2);
  });

  it("filtra por pessoa, incluindo lançamentos divididos com um grupo do qual ela participa", async () => {
    const h = await criarHousehold();
    const { banco, isa, gabi } = await montarCadastros(h.id);
    const familia = await criarPessoa(prismaTest, h.id, {
      nome: "Família",
      tipo: "FAMILIA",
    });
    await definirIntegrantes(prismaTest, h.id, familia.id, [
      { pessoaId: isa.id, peso: 60 },
      { pessoaId: gabi.id, peso: 40 },
    ]);

    // Gasto do grupo Família, pago pela Gabi — Isa participa do grupo mas não
    // é dona da divisão nem pagou; deve aparecer para ela mesmo assim.
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-01"),
      valorCentavos: 10_000,
      bancoId: banco.id,
      pessoaDivisaoId: familia.id,
      pessoaPagouId: gabi.id,
      tipoGasto: "VARIAVEL",
    });
    // Gasto individual da Gabi, sem relação com a Isa ou o grupo.
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-02"),
      valorCentavos: 2000,
      bancoId: banco.id,
      pessoaDivisaoId: gabi.id,
      pessoaPagouId: gabi.id,
      tipoGasto: "VARIAVEL",
    });

    const lancamentos = await listarLancamentos(prismaTest, h.id, {
      pessoaId: isa.id,
    });

    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0].valorCentavos).toBe(10_000);
  });

  it("filtra por banco", async () => {
    const h = await criarHousehold();
    const { banco, isa } = await montarCadastros(h.id);
    const outroBanco = await criarBanco(prismaTest, h.id, {
      nome: "Itaú",
      tipo: "CONTA_CORRENTE",
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-01"),
      valorCentavos: 1000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-02"),
      valorCentavos: 2000,
      bancoId: outroBanco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    const lancamentos = await listarLancamentos(prismaTest, h.id, {
      bancoId: outroBanco.id,
    });

    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0].valorCentavos).toBe(2000);
  });

  it("não lista lançamentos de outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const { banco, isa } = await montarCadastros(h1.id);
    await criarLancamento(prismaTest, h1.id, {
      data: new Date("2026-06-01"),
      valorCentavos: 1000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });

    const lancamentos = await listarLancamentos(prismaTest, h2.id);
    expect(lancamentos).toHaveLength(0);
  });
});

describe("buscarSugestoesDescricao", () => {
  it("ignora maiúsculas/minúsculas e acentos ao buscar", async () => {
    const h = await criarHousehold();
    const { categoria, subcategoria, banco, isa, gabi } = await montarCadastros(
      h.id,
    );
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-10"),
      descricaoPropria: "Padaria Açúcar",
      valorCentavos: 1500,
      categoriaId: categoria.id,
      subcategoriaId: subcategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: gabi.id,
      pessoaPagouId: isa.id,
      tipoGasto: "FIXO",
    });

    const sugestoes = await buscarSugestoesDescricao(prismaTest, h.id, "acucar");

    expect(sugestoes).toHaveLength(1);
    expect(sugestoes[0].descricao).toBe("Padaria Açúcar");
    expect(sugestoes[0].categoriaId).toBe(categoria.id);
    expect(sugestoes[0].subcategoriaId).toBe(subcategoria.id);
    expect(sugestoes[0].pessoaDivisaoId).toBe(gabi.id);
    expect(sugestoes[0].tipoGasto).toBe("FIXO");
  });

  it("retorna apenas uma sugestão por descrição, com os dados do lançamento mais recente", async () => {
    const h = await criarHousehold();
    const { categoria, banco, isa, gabi } = await montarCadastros(h.id);
    const outraCategoria = await criarCategoria(prismaTest, h.id, {
      nome: "Lazer",
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-05-01"),
      descricaoPropria: "Supermercado",
      valorCentavos: 1000,
      categoriaId: categoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "VARIAVEL",
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-01"),
      descricaoPropria: "supermercado",
      valorCentavos: 2000,
      categoriaId: outraCategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: gabi.id,
      pessoaPagouId: gabi.id,
      tipoGasto: "FIXO",
    });

    const sugestoes = await buscarSugestoesDescricao(
      prismaTest,
      h.id,
      "mercado",
    );

    expect(sugestoes).toHaveLength(1);
    expect(sugestoes[0].descricao).toBe("supermercado");
    expect(sugestoes[0].categoriaId).toBe(outraCategoria.id);
    expect(sugestoes[0].pessoaDivisaoId).toBe(gabi.id);
    expect(sugestoes[0].tipoGasto).toBe("FIXO");
  });

  it("não sugere descrições de outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const { banco, isa } = await montarCadastros(h1.id);
    await criarLancamento(prismaTest, h1.id, {
      data: new Date("2026-06-10"),
      descricaoPropria: "Aluguel",
      valorCentavos: 150000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
      tipoGasto: "FIXO",
    });

    const sugestoes = await buscarSugestoesDescricao(prismaTest, h2.id, "alu");
    expect(sugestoes).toHaveLength(0);
  });

  it("retorna lista vazia para termo em branco", async () => {
    const h = await criarHousehold();
    const sugestoes = await buscarSugestoesDescricao(prismaTest, h.id, "   ");
    expect(sugestoes).toHaveLength(0);
  });
});
