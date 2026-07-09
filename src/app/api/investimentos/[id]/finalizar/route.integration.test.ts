import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { limparBanco, prismaTest } from "@/test/prisma";
import { SESSION_COOKIE, encryptSession } from "@/lib/auth/session";

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

let POST: typeof import("./route").POST;

async function criarHouseholdComSessao() {
  const household = await prismaTest.household.create({
    data: { nome: `Casa ${Math.random()}` },
  });
  const token = encryptSession({
    userId: "user-fake",
    householdId: household.id,
    expiresAt: Date.now() + 60_000,
  });
  return { household, cookie: `${SESSION_COOKIE}=${token}` };
}

async function criarBancoEPessoa(householdId: string) {
  const banco = await prismaTest.banco.create({
    data: { nome: "XP", tipo: "CORRETORA", householdId },
  });
  const pessoa = await prismaTest.pessoa.create({
    data: { nome: "Isa", tipo: "INDIVIDUAL", householdId },
  });
  return { banco, pessoa };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(cookie?: string, body?: unknown) {
  return new NextRequest("http://localhost/api/investimentos/x/finalizar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeAll(async () => {
  ({ POST } = await import("./route"));
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("POST /api/investimentos/[id]/finalizar", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await POST(
      req(undefined, { valorResgatadoCentavos: 100 }),
      ctx("qualquer-id"),
    );
    expect(response.status).toBe(401);
  });

  it("finaliza o investimento e cria a receita do resgate", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, pessoa } = await criarBancoEPessoa(household.id);
    const investimento = await prismaTest.investimento.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        tipo: "RENDA_FIXA",
        produto: "LCI",
        valorAtualCentavos: 500000,
        householdId: household.id,
      },
    });

    const response = await POST(
      req(cookie, {
        valorResgatadoCentavos: 500000,
        valorReinvestidoCentavos: 0,
        criarReceita: true,
      }),
      ctx(investimento.id),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.investimento.status).toBe("FINALIZADO");
    expect(body.receita.valorCentavos).toBe(500000);

    const restante = await prismaTest.investimento.findUnique({
      where: { id: investimento.id },
    });
    expect(restante).not.toBeNull();
    expect(restante?.status).toBe("FINALIZADO");
  });

  it("retorna 404 para investimento de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const { banco, pessoa } = await criarBancoEPessoa(outraHousehold.id);
    const investimento = await prismaTest.investimento.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        tipo: "RENDA_FIXA",
        produto: "LCI",
        valorAtualCentavos: 500000,
        householdId: outraHousehold.id,
      },
    });

    const response = await POST(
      req(cookie, { valorResgatadoCentavos: 500000 }),
      ctx(investimento.id),
    );
    expect(response.status).toBe(404);
  });

  it("retorna 400 para payload inválido", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, pessoa } = await criarBancoEPessoa(household.id);
    const investimento = await prismaTest.investimento.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        tipo: "RENDA_FIXA",
        produto: "LCI",
        valorAtualCentavos: 500000,
        householdId: household.id,
      },
    });

    const response = await POST(
      req(cookie, {
        valorResgatadoCentavos: 500000,
        valorReinvestidoCentavos: 600000,
      }),
      ctx(investimento.id),
    );
    expect(response.status).toBe(400);
  });

  it("retorna 409 ao finalizar um investimento já finalizado", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, pessoa } = await criarBancoEPessoa(household.id);
    const investimento = await prismaTest.investimento.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        tipo: "RENDA_FIXA",
        produto: "LCI",
        valorAtualCentavos: 500000,
        householdId: household.id,
        status: "FINALIZADO",
      },
    });

    const response = await POST(
      req(cookie, { valorResgatadoCentavos: 500000 }),
      ctx(investimento.id),
    );
    expect(response.status).toBe(409);
  });
});
