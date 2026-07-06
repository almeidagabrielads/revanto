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

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, cookie?: string, body?: unknown) {
  return new NextRequest("http://localhost/api/categorias/x", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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

describe("GET /api/categorias/[id]", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(req("GET"), ctx("qualquer-id"));
    expect(response.status).toBe(401);
  });

  it("retorna 404 para categoria de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Intrusa", householdId: outraHousehold.id },
    });

    const response = await GET(req("GET", cookie), ctx(categoria.id));
    expect(response.status).toBe(404);
  });

  it("retorna a categoria do household correto, com subcategorias", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Casa", householdId: household.id },
    });
    await prismaTest.subcategoria.create({
      data: {
        nome: "Energia",
        categoriaId: categoria.id,
        householdId: household.id,
      },
    });

    const response = await GET(req("GET", cookie), ctx(categoria.id));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nome).toBe("Casa");
    expect(body.subcategorias).toHaveLength(1);
  });
});

describe("PATCH /api/categorias/[id]", () => {
  it("atualiza nome", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Casa", householdId: household.id },
    });

    const response = await PATCH(
      req("PATCH", cookie, { nome: "Moradia" }),
      ctx(categoria.id),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nome).toBe("Moradia");
  });

  it("retorna 404 ao atualizar categoria de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Intrusa", householdId: outraHousehold.id },
    });

    const response = await PATCH(
      req("PATCH", cookie, { nome: "Invasora" }),
      ctx(categoria.id),
    );
    expect(response.status).toBe(404);
  });

  it("retorna 400 para nome vazio", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Casa", householdId: household.id },
    });

    const response = await PATCH(
      req("PATCH", cookie, { nome: "" }),
      ctx(categoria.id),
    );
    expect(response.status).toBe(400);
  });
});
