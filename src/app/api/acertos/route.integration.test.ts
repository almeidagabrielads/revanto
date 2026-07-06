import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { limparBanco, prismaTest } from "@/test/prisma";
import { SESSION_COOKIE, encryptSession } from "@/lib/auth/session";

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

let GET: typeof import("./route").GET;
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

function getRequest(cookie?: string) {
  return new NextRequest("http://localhost/api/acertos", {
    headers: cookie ? { cookie } : {},
  });
}

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/acertos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await limparBanco();
  ({ GET, POST } = await import("./route"));
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("GET /api/acertos", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("lista histórico escopado ao household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const gabi = await prismaTest.pessoa.create({
      data: { nome: "Gabi", tipo: "INDIVIDUAL", householdId: household.id },
    });
    await prismaTest.acertoContas.create({
      data: {
        householdId: household.id,
        dataInicio: new Date(Date.UTC(2026, 0, 1)),
        dataFim: new Date(Date.UTC(2026, 0, 31)),
        deId: gabi.id,
        paraId: isa.id,
        valorCentavos: 12_345,
      },
    });

    const response = await GET(getRequest(cookie));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].valorCentavos).toBe(12_345);
  });
});

describe("POST /api/acertos", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await POST(
      postRequest({ dataInicio: "2026-01-01", dataFim: "2026-01-31" }),
    );
    expect(response.status).toBe(401);
  });

  it("retorna 400 para datas inválidas", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const response = await POST(
      postRequest({ dataInicio: "não é data", dataFim: "2026-01-31" }, cookie),
    );
    expect(response.status).toBe(400);
  });

  it("retorna 400 quando não há pelo menos duas pessoas Individual", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const response = await POST(
      postRequest({ dataInicio: "2026-01-01", dataFim: "2026-01-31" }, cookie),
    );
    expect(response.status).toBe(400);
  });

  it("registra a transferência sugerida do período como acerto resolvido", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const gabi = await prismaTest.pessoa.create({
      data: { nome: "Gabi", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: household.id },
    });
    const banco = await prismaTest.banco.create({
      data: { nome: "Nubank", tipo: "CONTA_CORRENTE", householdId: household.id },
    });
    await prismaTest.lancamento.create({
      data: {
        data: new Date(Date.UTC(2026, 0, 10)),
        valorCentavos: 100_00,
        householdId: household.id,
        categoriaId: categoria.id,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: gabi.id,
      },
    });

    const response = await POST(
      postRequest({ dataInicio: "2026-01-01", dataFim: "2026-01-31" }, cookie),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toHaveLength(1);
    expect(body[0].deId).toBe(isa.id);
    expect(body[0].paraId).toBe(gabi.id);
    expect(body[0].valorCentavos).toBe(100_00);

    const historico = await prismaTest.acertoContas.findMany({
      where: { householdId: household.id },
    });
    expect(historico).toHaveLength(1);
  });

  it("não registra nada quando as contas já estão quitadas", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    await prismaTest.pessoa.create({
      data: { nome: "Gabi", tipo: "INDIVIDUAL", householdId: household.id },
    });

    const response = await POST(
      postRequest({ dataInicio: "2026-01-01", dataFim: "2026-01-31" }, cookie),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual([]);
  });
});
