import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { limparBanco, prismaTest } from "@/test/prisma";
import { SESSION_COOKIE, encryptSession } from "@/lib/auth/session";

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

let GET: typeof import("./route").GET;
let POST: typeof import("./route").POST;
let DELETE: typeof import("./route").DELETE;

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
  return new NextRequest("http://localhost/api/calculadora/historico", {
    headers: cookie ? { cookie } : {},
  });
}

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/calculadora/historico", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function deleteRequest(cookie?: string) {
  return new NextRequest("http://localhost/api/calculadora/historico", {
    method: "DELETE",
    headers: cookie ? { cookie } : {},
  });
}

beforeAll(async () => {
  ({ GET, POST, DELETE } = await import("./route"));
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("GET /api/calculadora/historico", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("lista apenas o histórico do household da sessão, mais recente primeiro", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    await prismaTest.calculadoraHistorico.create({
      data: {
        householdId: household.id,
        expressao: "10 + 5",
        resultado: "15",
      },
    });
    await prismaTest.calculadoraHistorico.create({
      data: {
        householdId: household.id,
        expressao: "20 × 2",
        resultado: "40",
      },
    });

    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    await prismaTest.calculadoraHistorico.create({
      data: {
        householdId: outraHousehold.id,
        expressao: "1 + 1",
        resultado: "2",
      },
    });

    const response = await GET(getRequest(cookie));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].expressao).toBe("20 × 2");
  });
});

describe("POST /api/calculadora/historico", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(401);
  });

  it("cria entrada de histórico vinculada ao household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();

    const response = await POST(
      postRequest({ expressao: "100 - 30", resultado: "70" }, cookie),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.householdId).toBe(household.id);
    expect(body.resultado).toBe("70");
  });

  it("retorna 400 para payload inválido", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const response = await POST(postRequest({ expressao: "" }, cookie));
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/calculadora/historico", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await DELETE(deleteRequest());
    expect(response.status).toBe(401);
  });

  it("limpa apenas o histórico do household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    await prismaTest.calculadoraHistorico.create({
      data: { householdId: household.id, expressao: "1 + 1", resultado: "2" },
    });
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    await prismaTest.calculadoraHistorico.create({
      data: {
        householdId: outraHousehold.id,
        expressao: "3 + 3",
        resultado: "6",
      },
    });

    const response = await DELETE(deleteRequest(cookie));
    expect(response.status).toBe(200);

    const restante = await prismaTest.calculadoraHistorico.findMany();
    expect(restante).toHaveLength(1);
    expect(restante[0].householdId).toBe(outraHousehold.id);
  });
});
