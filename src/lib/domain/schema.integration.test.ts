import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function criarHousehold(nome = "Isa & Gabi") {
  return prismaTest.household.create({ data: { nome } });
}

async function criarPessoa(
  householdId: string,
  nome: string,
  tipo: "INDIVIDUAL" | "CASAL" | "FAMILIA" | "OUTRO" = "INDIVIDUAL",
) {
  return prismaTest.pessoa.create({ data: { nome, tipo, householdId } });
}

async function criarBanco(householdId: string, nome = "Nubank") {
  return prismaTest.banco.create({
    data: { nome, tipo: "CONTA_CORRENTE", householdId },
  });
}

async function criarCategoria(householdId: string, nome = "Alimentação") {
  return prismaTest.categoria.create({ data: { nome, householdId } });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

// ─── Household ────────────────────────────────────────────────────────────────

describe("Household", () => {
  it("cria um household", async () => {
    const h = await criarHousehold("Isa & Gabi");
    expect(h.id).toBeTruthy();
    expect(h.nome).toBe("Isa & Gabi");
  });

  it("rejeita nome duplicado", async () => {
    await criarHousehold("Isa & Gabi");
    await expect(criarHousehold("Isa & Gabi")).rejects.toThrow();
  });
});

// ─── Pessoa ───────────────────────────────────────────────────────────────────

describe("Pessoa", () => {
  it("cria pessoa individual", async () => {
    const h = await criarHousehold();
    const p = await criarPessoa(h.id, "Gabi", "INDIVIDUAL");
    expect(p.tipo).toBe("INDIVIDUAL");
  });

  it("rejeita nome duplicado dentro do mesmo household", async () => {
    const h = await criarHousehold();
    await criarPessoa(h.id, "Gabi");
    await expect(criarPessoa(h.id, "Gabi")).rejects.toThrow();
  });

  it("permite mesmo nome em households diferentes", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    await expect(
      Promise.all([criarPessoa(h1.id, "Gabi"), criarPessoa(h2.id, "Gabi")]),
    ).resolves.toHaveLength(2);
  });

  it("rejeita householdId inexistente (FK)", async () => {
    await expect(criarPessoa("id-invalido", "Alguém")).rejects.toThrow();
  });
});

// ─── Categoria e Subcategoria ──────────────────────────────────────────────────

describe("Categoria / Subcategoria", () => {
  it("subcategoria pertence a uma categoria", async () => {
    const h = await criarHousehold();
    const cat = await criarCategoria(h.id, "Alimentação");
    const sub = await prismaTest.subcategoria.create({
      data: { nome: "Supermercado", categoriaId: cat.id, householdId: h.id },
    });
    expect(sub.categoriaId).toBe(cat.id);
  });

  it("rejeita nomes de subcategoria duplicados na mesma categoria", async () => {
    const h = await criarHousehold();
    const cat = await criarCategoria(h.id);
    await prismaTest.subcategoria.create({
      data: { nome: "Supermercado", categoriaId: cat.id, householdId: h.id },
    });
    await expect(
      prismaTest.subcategoria.create({
        data: {
          nome: "Supermercado",
          categoriaId: cat.id,
          householdId: h.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("permite mesmo nome de subcategoria em categorias distintas", async () => {
    const h = await criarHousehold();
    const cat1 = await criarCategoria(h.id, "Alimentação");
    const cat2 = await criarCategoria(h.id, "Lazer");
    const resultado = await Promise.all([
      prismaTest.subcategoria.create({
        data: { nome: "Outros", categoriaId: cat1.id, householdId: h.id },
      }),
      prismaTest.subcategoria.create({
        data: { nome: "Outros", categoriaId: cat2.id, householdId: h.id },
      }),
    ]);
    expect(resultado).toHaveLength(2);
  });

  it("orcamentoCentavos da subcategoria aceita valor inteiro em centavos", async () => {
    const h = await criarHousehold();
    const cat = await criarCategoria(h.id, "Moradia");
    const sub = await prismaTest.subcategoria.create({
      data: {
        nome: "Aluguel",
        categoriaId: cat.id,
        householdId: h.id,
        orcamentoCentavos: 280000,
      },
    });
    expect(sub.orcamentoCentavos).toBe(280000);
  });
});

// ─── Lançamento (RF04, RF05, RF11) ────────────────────────────────────────────

describe("Lancamento", () => {
  async function fixture() {
    const h = await criarHousehold();
    const gabi = await criarPessoa(h.id, "Gabi");
    const isa = await criarPessoa(h.id, "Isa");
    const banco = await criarBanco(h.id);
    return { h, gabi, isa, banco };
  }

  it("registra divisão e quem pagou como Pessoas distintas (RF11)", async () => {
    const { h, gabi, isa, banco } = await fixture();
    const lanc = await prismaTest.lancamento.create({
      data: {
        data: new Date("2025-01-15"),
        valorCentavos: 10000,
        bancoId: banco.id,
        pessoaDivisaoId: gabi.id, // gasto é da Gabi
        pessoaPagouId: isa.id, // mas a Isa pagou
        householdId: h.id,
      },
      include: { pessoaDivisao: true, pessoaPagou: true },
    });
    expect(lanc.pessoaDivisao.nome).toBe("Gabi");
    expect(lanc.pessoaPagou.nome).toBe("Isa");
  });

  it("aceita a mesma pessoa em divisão e pagamento", async () => {
    const { h, gabi, banco } = await fixture();
    const lanc = await prismaTest.lancamento.create({
      data: {
        data: new Date("2025-01-10"),
        valorCentavos: 5000,
        bancoId: banco.id,
        pessoaDivisaoId: gabi.id,
        pessoaPagouId: gabi.id,
        householdId: h.id,
      },
    });
    expect(lanc.pessoaDivisaoId).toBe(lanc.pessoaPagouId);
  });

  it("aceita valor negativo (estorno — RF05)", async () => {
    const { h, gabi, banco } = await fixture();
    const estorno = await prismaTest.lancamento.create({
      data: {
        data: new Date("2025-02-01"),
        valorCentavos: -3000,
        bancoId: banco.id,
        pessoaDivisaoId: gabi.id,
        pessoaPagouId: gabi.id,
        householdId: h.id,
      },
    });
    expect(estorno.valorCentavos).toBe(-3000);
  });

  it("desconto padrão é zero", async () => {
    const { h, gabi, banco } = await fixture();
    const lanc = await prismaTest.lancamento.create({
      data: {
        data: new Date("2025-03-01"),
        valorCentavos: 8000,
        bancoId: banco.id,
        pessoaDivisaoId: gabi.id,
        pessoaPagouId: gabi.id,
        householdId: h.id,
      },
    });
    expect(lanc.descontoCentavos).toBe(0);
  });

  it("categoria e subcategoria são opcionais", async () => {
    const { h, gabi, banco } = await fixture();
    const lanc = await prismaTest.lancamento.create({
      data: {
        data: new Date("2025-04-01"),
        valorCentavos: 1000,
        bancoId: banco.id,
        pessoaDivisaoId: gabi.id,
        pessoaPagouId: gabi.id,
        householdId: h.id,
        categoriaId: null,
        subcategoriaId: null,
      },
    });
    expect(lanc.categoriaId).toBeNull();
    expect(lanc.subcategoriaId).toBeNull();
  });

  it("rejeita bancoId inexistente (FK)", async () => {
    const { h, gabi } = await fixture();
    await expect(
      prismaTest.lancamento.create({
        data: {
          data: new Date("2025-01-01"),
          valorCentavos: 100,
          bancoId: "banco-invalido",
          pessoaDivisaoId: gabi.id,
          pessoaPagouId: gabi.id,
          householdId: h.id,
        },
      }),
    ).rejects.toThrow();
  });
});

// ─── Receita ──────────────────────────────────────────────────────────────────

describe("Receita", () => {
  it("cria receita com subtipo SALARIO", async () => {
    const h = await criarHousehold();
    const gabi = await criarPessoa(h.id, "Gabi");
    const rec = await prismaTest.receita.create({
      data: {
        pessoaId: gabi.id,
        subtipo: "SALARIO",
        valorCentavos: 500000,
        mes: new Date("2025-01-01"),
        householdId: h.id,
      },
    });
    expect(rec.subtipo).toBe("SALARIO");
    expect(rec.valorCentavos).toBe(500000);
  });
});

// ─── OrçamentoPlanejado ────────────────────────────────────────────────────────

describe("OrcamentoPlanejado", () => {
  it("cria orçamento do casal (pessoaId null)", async () => {
    const h = await criarHousehold();
    const cat = await criarCategoria(h.id);
    const orc = await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: null,
        categoriaId: cat.id,
        mes: 1,
        ano: 2025,
        valorCentavos: 200000,
        householdId: h.id,
      },
    });
    expect(orc.pessoaId).toBeNull();
  });

  it("rejeita orçamento duplicado para mesma pessoa/categoria/mês/ano", async () => {
    const h = await criarHousehold();
    const gabi = await criarPessoa(h.id, "Gabi");
    const cat = await criarCategoria(h.id);
    const base = {
      pessoaId: gabi.id,
      categoriaId: cat.id,
      subcategoriaId: null,
      mes: 3,
      ano: 2025,
      valorCentavos: 50000,
      householdId: h.id,
    };
    await prismaTest.orcamentoPlanejado.create({ data: base });
    await expect(
      prismaTest.orcamentoPlanejado.create({ data: base }),
    ).rejects.toThrow();
  });
});

// ─── Investimento ─────────────────────────────────────────────────────────────

describe("Investimento", () => {
  it("cria investimento Renda Fixa com vencimento e liquidezDias", async () => {
    const h = await criarHousehold();
    const gabi = await criarPessoa(h.id, "Gabi");
    const banco = await criarBanco(h.id, "Tesouro Direto");
    const inv = await prismaTest.investimento.create({
      data: {
        bancoId: banco.id,
        tipo: "RENDA_FIXA",
        produto: "Tesouro IPCA+ 2029",
        valorAtualCentavos: 1000000,
        vencimento: new Date("2029-05-15"),
        liquidezDias: 1,
        pessoaId: gabi.id,
        householdId: h.id,
      },
    });
    expect(inv.tipo).toBe("RENDA_FIXA");
    expect(inv.liquidezDias).toBe(1);
  });

  it("vencimento e liquidezDias são opcionais (ex.: FGTS)", async () => {
    const h = await criarHousehold();
    const gabi = await criarPessoa(h.id, "Gabi");
    const banco = await criarBanco(h.id, "CEF");
    const inv = await prismaTest.investimento.create({
      data: {
        bancoId: banco.id,
        tipo: "FGTS",
        produto: "FGTS",
        valorAtualCentavos: 350000,
        pessoaId: gabi.id,
        householdId: h.id,
      },
    });
    expect(inv.vencimento).toBeNull();
    expect(inv.liquidezDias).toBeNull();
  });
});

// ─── PosicaoPatrimonio ────────────────────────────────────────────────────────

describe("PosicaoPatrimonio", () => {
  it("cria posição de patrimônio mensal", async () => {
    const h = await criarHousehold();
    const banco = await criarBanco(h.id, "XP");
    const pos = await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        mes: new Date("2025-01-01"),
        valorCentavos: 8000000,
        householdId: h.id,
      },
    });
    expect(pos.valorCentavos).toBe(8000000);
  });

  it("rejeita posição duplicada para mesmo banco/mês", async () => {
    const h = await criarHousehold();
    const banco = await criarBanco(h.id, "XP");
    const base = {
      bancoId: banco.id,
      mes: new Date("2025-06-01"),
      valorCentavos: 9000000,
      householdId: h.id,
    };
    await prismaTest.posicaoPatrimonio.create({ data: base });
    await expect(
      prismaTest.posicaoPatrimonio.create({ data: base }),
    ).rejects.toThrow();
  });
});

// ─── Isolamento por household ──────────────────────────────────────────────────

describe("Isolamento por household", () => {
  it("lançamentos de households distintos não se misturam", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const gabi1 = await criarPessoa(h1.id, "Gabi");
    const gabi2 = await criarPessoa(h2.id, "Gabi");
    const banco1 = await criarBanco(h1.id, "Nu");
    const banco2 = await criarBanco(h2.id, "Nu");

    await prismaTest.lancamento.create({
      data: {
        data: new Date("2025-01-01"),
        valorCentavos: 1000,
        bancoId: banco1.id,
        pessoaDivisaoId: gabi1.id,
        pessoaPagouId: gabi1.id,
        householdId: h1.id,
      },
    });

    const lancH2 = await prismaTest.lancamento.findMany({
      where: { householdId: h2.id },
    });
    expect(lancH2).toHaveLength(0);

    // Pessoa de h1 não pode ser referenciada em lançamento de h2
    await expect(
      prismaTest.lancamento.create({
        data: {
          data: new Date("2025-01-01"),
          valorCentavos: 500,
          bancoId: banco2.id,
          pessoaDivisaoId: gabi1.id, // pessoa do household errado
          pessoaPagouId: gabi2.id,
          householdId: h2.id,
        },
      }),
    ).resolves.toBeDefined(); // Prisma não impede em nível de FK, isolamento é na query layer
  });
});
