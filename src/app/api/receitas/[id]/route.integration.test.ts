import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { limparBanco, prismaTest } from "@/test/prisma";
import { SESSION_COOKIE, encryptSession } from "@/lib/auth/session";

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

let GET: typeof import("./route").GET;
let PATCH: typeof import("./route").PATCH;
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

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, cookie?: string, body?: unknown) {
  return new NextRequest("http://localhost/api/receitas/x", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeAll(async () => {
  ({ GET, PATCH, DELETE } = await import("./route"));
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("GET /api/receitas/[id]", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(req("GET"), ctx("qualquer-id"));
    expect(response.status).toBe(401);
  });

  it("retorna 404 para receita de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const pessoa = await prismaTest.pessoa.create({
      data: {
        nome: "Intrusa",
        tipo: "INDIVIDUAL",
        householdId: outraHousehold.id,
      },
    });
    const receita = await prismaTest.receita.create({
      data: {
        pessoaId: pessoa.id,
        subtipo: "SALARIO",
        valorCentavos: 500000,
        mes: new Date("2026-06-01"),
        householdId: outraHousehold.id,
      },
    });

    const response = await GET(req("GET", cookie), ctx(receita.id));
    expect(response.status).toBe(404);
  });

  it("retorna a receita do household correto", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const pessoa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const receita = await prismaTest.receita.create({
      data: {
        pessoaId: pessoa.id,
        subtipo: "SALARIO",
        valorCentavos: 500000,
        mes: new Date("2026-06-01"),
        householdId: household.id,
      },
    });

    const response = await GET(req("GET", cookie), ctx(receita.id));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.valorCentavos).toBe(500000);
  });
});

describe("PATCH /api/receitas/[id]", () => {
  it("atualiza receita existente", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const pessoa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const receita = await prismaTest.receita.create({
      data: {
        pessoaId: pessoa.id,
        subtipo: "SALARIO",
        valorCentavos: 500000,
        mes: new Date("2026-06-01"),
        householdId: household.id,
      },
    });

    const response = await PATCH(
      req("PATCH", cookie, { subtipo: "VOUCHER", valorCentavos: 30000 }),
      ctx(receita.id),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.subtipo).toBe("VOUCHER");
    expect(body.valorCentavos).toBe(30000);
  });

  it("retorna 404 ao atualizar receita de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const pessoa = await prismaTest.pessoa.create({
      data: {
        nome: "Intrusa",
        tipo: "INDIVIDUAL",
        householdId: outraHousehold.id,
      },
    });
    const receita = await prismaTest.receita.create({
      data: {
        pessoaId: pessoa.id,
        subtipo: "SALARIO",
        valorCentavos: 500000,
        mes: new Date("2026-06-01"),
        householdId: outraHousehold.id,
      },
    });

    const response = await PATCH(
      req("PATCH", cookie, { valorCentavos: 100 }),
      ctx(receita.id),
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/receitas/[id]", () => {
  it("remove receita existente", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const pessoa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const receita = await prismaTest.receita.create({
      data: {
        pessoaId: pessoa.id,
        subtipo: "SALARIO",
        valorCentavos: 500000,
        mes: new Date("2026-06-01"),
        householdId: household.id,
      },
    });

    const response = await DELETE(req("DELETE", cookie), ctx(receita.id));
    expect(response.status).toBe(200);

    const restante = await prismaTest.receita.findUnique({
      where: { id: receita.id },
    });
    expect(restante).toBeNull();
  });

  it("retorna 404 ao remover receita de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const pessoa = await prismaTest.pessoa.create({
      data: {
        nome: "Intrusa",
        tipo: "INDIVIDUAL",
        householdId: outraHousehold.id,
      },
    });
    const receita = await prismaTest.receita.create({
      data: {
        pessoaId: pessoa.id,
        subtipo: "SALARIO",
        valorCentavos: 500000,
        mes: new Date("2026-06-01"),
        householdId: outraHousehold.id,
      },
    });

    const response = await DELETE(req("DELETE", cookie), ctx(receita.id));
    expect(response.status).toBe(404);
  });
});
