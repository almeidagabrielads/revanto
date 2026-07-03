import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarCategoria } from "./categorias";
import { criarSubcategoria } from "./subcategorias";
import { criarBanco } from "./bancos";
import { criarPessoa } from "./pessoas";
import {
  atualizarLancamento,
  buscarLancamento,
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
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-15"),
      valorCentavos: 2000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
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
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-02"),
      valorCentavos: 2000,
      categoriaId: outraCategoria.id,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
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
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-02"),
      valorCentavos: 2000,
      bancoId: banco.id,
      pessoaDivisaoId: gabi.id,
      pessoaPagouId: gabi.id,
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-03"),
      valorCentavos: 3000,
      bancoId: banco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
    });

    const lancamentos = await listarLancamentos(prismaTest, h.id, {
      pessoaId: isa.id,
    });

    expect(lancamentos).toHaveLength(2);
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
    });
    await criarLancamento(prismaTest, h.id, {
      data: new Date("2026-06-02"),
      valorCentavos: 2000,
      bancoId: outroBanco.id,
      pessoaDivisaoId: isa.id,
      pessoaPagouId: isa.id,
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
    });

    const lancamentos = await listarLancamentos(prismaTest, h2.id);
    expect(lancamentos).toHaveLength(0);
  });
});
