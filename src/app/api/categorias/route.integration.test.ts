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

function getRequest(cookie?: string, query = "") {
  return new NextRequest(`http://localhost/api/categorias${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/categorias", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  ({ GET, POST } = await import("./route"));
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("GET /api/categorias", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("lista apenas categorias ativas do household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    await prismaTest.categoria.create({
      data: { nome: "Casa", householdId: household.id },
    });
    await prismaTest.categoria.create({
      data: { nome: "Inativa", householdId: household.id, ativo: false },
    });
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    await prismaTest.categoria.create({
      data: { nome: "Intrusa", householdId: outraHousehold.id },
    });

    const response = await GET(getRequest(cookie));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].nome).toBe("Casa");
  });

  it("inclui categorias inativas quando incluirInativas=true", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    await prismaTest.categoria.create({
      data: { nome: "Casa", householdId: household.id, ativo: false },
    });

    const response = await GET(getRequest(cookie, "?incluirInativas=true"));
    const body = await response.json();

    expect(body).toHaveLength(1);
  });
});

describe("POST /api/categorias", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await POST(postRequest({ nome: "Casa" }));
    expect(response.status).toBe(401);
  });

  it("cria categoria vinculada ao household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();

    const response = await POST(postRequest({ nome: "Casa" }, cookie));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.nome).toBe("Casa");
    expect(body.householdId).toBe(household.id);
  });

  it("retorna 400 para nome vazio", async () => {
    const { cookie } = await criarHouseholdComSessao();

    const response = await POST(postRequest({ nome: "" }, cookie));
    expect(response.status).toBe(400);
  });

  it("retorna 409 para nome duplicado no mesmo household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    await POST(postRequest({ nome: "Casa" }, cookie));

    const response = await POST(postRequest({ nome: "Casa" }, cookie));
    expect(response.status).toBe(409);
  });
});
