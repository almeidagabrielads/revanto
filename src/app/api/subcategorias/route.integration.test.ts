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
  return new NextRequest(`http://localhost/api/subcategorias${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/subcategorias", {
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

describe("GET /api/subcategorias", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("filtra por categoriaId e household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const casa = await prismaTest.categoria.create({
      data: { nome: "Casa", householdId: household.id },
    });
    const viagem = await prismaTest.categoria.create({
      data: { nome: "Viagem", householdId: household.id },
    });
    await prismaTest.subcategoria.create({
      data: {
        nome: "Energia",
        categoriaId: casa.id,
        householdId: household.id,
      },
    });
    await prismaTest.subcategoria.create({
      data: {
        nome: "Passagem",
        categoriaId: viagem.id,
        householdId: household.id,
      },
    });

    const response = await GET(getRequest(cookie, `?categoriaId=${casa.id}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].nome).toBe("Energia");
  });
});

describe("POST /api/subcategorias", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await POST(
      postRequest({ nome: "Energia", categoriaId: "x" }),
    );
    expect(response.status).toBe(401);
  });

  it("cria subcategoria vinculada à categoria e ao household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Casa", householdId: household.id },
    });

    const response = await POST(
      postRequest({ nome: "Energia", categoriaId: categoria.id }, cookie),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.nome).toBe("Energia");
    expect(body.categoriaId).toBe(categoria.id);
    expect(body.householdId).toBe(household.id);
  });

  it("retorna 404 se a categoria não pertence ao household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Intrusa", householdId: outraHousehold.id },
    });

    const response = await POST(
      postRequest({ nome: "Energia", categoriaId: categoria.id }, cookie),
    );
    expect(response.status).toBe(404);
  });

  it("retorna 400 para nome vazio", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Casa", householdId: household.id },
    });

    const response = await POST(
      postRequest({ nome: "", categoriaId: categoria.id }, cookie),
    );
    expect(response.status).toBe(400);
  });
});
