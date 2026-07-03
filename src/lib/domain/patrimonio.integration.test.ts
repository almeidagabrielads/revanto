import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarPessoa } from "./pessoas";
import { criarBanco } from "./bancos";
import {
  atualizarPosicaoPatrimonio,
  buscarPosicaoPatrimonio,
  criarPosicaoPatrimonio,
  listarPosicoesPatrimonio,
  removerPosicaoPatrimonio,
} from "./patrimonio";

async function criarHousehold(nome = "Isa & Gabi") {
  return prismaTest.household.create({ data: { nome } });
}

async function montarBase(householdNome = "Isa & Gabi") {
  const household = await criarHousehold(householdNome);
  const isa = await criarPessoa(prismaTest, household.id, {
    nome: "Isa",
    tipo: "INDIVIDUAL",
  });
  const banco = await criarBanco(prismaTest, household.id, {
    nome: "XP",
    tipo: "CORRETORA",
  });
  return { household, isa, banco };
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

describe("criarPosicaoPatrimonio", () => {
  it("cria posição de patrimônio com titular, normalizando o mês para o dia 1", async () => {
    const { household, isa, banco } = await montarBase();

    const posicao = await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      pessoaId: isa.id,
      mes: new Date("2026-03-15"),
      valorCentavos: 62_071_951,
    });

    expect(posicao?.householdId).toBe(household.id);
    expect(posicao?.pessoaId).toBe(isa.id);
    expect(posicao?.mes.toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("cria posição de patrimônio do casal sem titular individual", async () => {
    const { household, banco } = await montarBase();

    const posicao = await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      mes: new Date("2026-01-01"),
      valorCentavos: 10_000_00,
    });

    expect(posicao?.pessoaId).toBeNull();
  });

  it("rejeita posição duplicada para mesmo banco/titular/mês", async () => {
    const { household, isa, banco } = await montarBase();

    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      pessoaId: isa.id,
      mes: new Date("2026-01-01"),
      valorCentavos: 1_000_00,
    });

    const duplicada = await prismaTest.posicaoPatrimonio
      .create({
        data: {
          bancoId: banco.id,
          pessoaId: isa.id,
          mes: new Date("2026-01-01"),
          valorCentavos: 2_000_00,
          householdId: household.id,
        },
      })
      .catch((e: unknown) => e);

    expect(duplicada).toBeInstanceOf(Error);
  });

  it("retorna null quando banco não pertence ao household", async () => {
    const { household, isa } = await montarBase();
    const outraCasa = await criarHousehold("Outra Casa");
    const bancoDeOutraCasa = await criarBanco(prismaTest, outraCasa.id, {
      nome: "Nubank",
      tipo: "CONTA_CORRENTE",
    });

    const posicao = await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: bancoDeOutraCasa.id,
      pessoaId: isa.id,
      mes: new Date("2026-01-01"),
      valorCentavos: 1_000_00,
    });

    expect(posicao).toBeNull();
  });
});

describe("listarPosicoesPatrimonio", () => {
  it("filtra por titular e por ano", async () => {
    const { household, isa, banco } = await montarBase();
    const gabi = await criarPessoa(prismaTest, household.id, {
      nome: "Gabi",
      tipo: "INDIVIDUAL",
    });

    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      pessoaId: isa.id,
      mes: new Date("2026-01-01"),
      valorCentavos: 1_000_00,
    });
    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      pessoaId: gabi.id,
      mes: new Date("2026-01-01"),
      valorCentavos: 2_000_00,
    });
    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      pessoaId: isa.id,
      mes: new Date("2025-12-01"),
      valorCentavos: 900_00,
    });

    const doAnoDaIsa = await listarPosicoesPatrimonio(
      prismaTest,
      household.id,
      {
        pessoaId: isa.id,
        ano: 2026,
      },
    );

    expect(doAnoDaIsa).toHaveLength(1);
    expect(doAnoDaIsa[0].valorCentavos).toBe(1_000_00);
  });
});

describe("atualizarPosicaoPatrimonio", () => {
  it("atualiza o valor de uma posição existente", async () => {
    const { household, isa, banco } = await montarBase();
    const posicao = await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      pessoaId: isa.id,
      mes: new Date("2026-01-01"),
      valorCentavos: 1_000_00,
    });

    const atualizada = await atualizarPosicaoPatrimonio(
      prismaTest,
      household.id,
      posicao!.id,
      { valorCentavos: 1_500_00 },
    );

    expect(atualizada?.valorCentavos).toBe(1_500_00);
  });

  it("retorna null para posição inexistente", async () => {
    const { household } = await montarBase();
    const atualizada = await atualizarPosicaoPatrimonio(
      prismaTest,
      household.id,
      "id-inexistente",
      { valorCentavos: 1_000_00 },
    );
    expect(atualizada).toBeNull();
  });
});

describe("removerPosicaoPatrimonio", () => {
  it("remove uma posição existente", async () => {
    const { household, isa, banco } = await montarBase();
    const posicao = await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      pessoaId: isa.id,
      mes: new Date("2026-01-01"),
      valorCentavos: 1_000_00,
    });

    await removerPosicaoPatrimonio(prismaTest, household.id, posicao!.id);

    const buscada = await buscarPosicaoPatrimonio(
      prismaTest,
      household.id,
      posicao!.id,
    );
    expect(buscada).toBeNull();
  });
});
