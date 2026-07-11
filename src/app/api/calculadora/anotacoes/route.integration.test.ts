import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { limparBanco, prismaTest } from "@/test/prisma";
import { SESSION_COOKIE, encryptSession } from "@/lib/auth/session";

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

let GET: typeof import("./route").GET;
let PATCH: typeof import("./route").PATCH;

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
  return new NextRequest("http://localhost/api/calculadora/anotacoes", {
    headers: cookie ? { cookie } : {},
  });
}

function patchRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/calculadora/anotacoes", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  ({ GET, PATCH } = await import("./route"));
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("GET /api/calculadora/anotacoes", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("cria a anotação com texto vazio na primeira leitura", async () => {
    const { household, cookie } = await criarHouseholdComSessao();

    const response = await GET(getRequest(cookie));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.householdId).toBe(household.id);
    expect(body.texto).toBe("");
  });
});

describe("PATCH /api/calculadora/anotacoes", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await PATCH(patchRequest({ texto: "oi" }));
    expect(response.status).toBe(401);
  });

  it("atualiza o texto da anotação do household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();

    const response = await PATCH(
      patchRequest({ texto: "lembrar de pagar o condomínio" }, cookie),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.texto).toBe("lembrar de pagar o condomínio");

    const salvo = await prismaTest.calculadoraAnotacao.findUnique({
      where: { householdId: household.id },
    });
    expect(salvo?.texto).toBe("lembrar de pagar o condomínio");
  });

  it("retorna 400 para payload inválido", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const response = await PATCH(patchRequest({ texto: 123 }, cookie));
    expect(response.status).toBe(400);
  });
});
