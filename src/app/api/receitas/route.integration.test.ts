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
  return new NextRequest(`http://localhost/api/receitas${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/receitas", {
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

describe("GET /api/receitas", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("lista apenas receitas do household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    await prismaTest.receita.create({
      data: {
        pessoaId: isa.id,
        subtipo: "SALARIO",
        valorCentavos: 500000,
        mes: new Date("2026-06-01"),
        householdId: household.id,
      },
    });
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const outraPessoa = await prismaTest.pessoa.create({
      data: {
        nome: "Intrusa",
        tipo: "INDIVIDUAL",
        householdId: outraHousehold.id,
      },
    });
    await prismaTest.receita.create({
      data: {
        pessoaId: outraPessoa.id,
        subtipo: "SALARIO",
        valorCentavos: 999,
        mes: new Date("2026-06-01"),
        householdId: outraHousehold.id,
      },
    });

    const response = await GET(getRequest(cookie));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].valorCentavos).toBe(500000);
  });

  it("filtra por pessoa e intervalo de mês", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const gabi = await prismaTest.pessoa.create({
      data: { nome: "Gabi", tipo: "INDIVIDUAL", householdId: household.id },
    });
    await prismaTest.receita.create({
      data: {
        pessoaId: isa.id,
        subtipo: "SALARIO",
        valorCentavos: 500000,
        mes: new Date("2026-06-01"),
        householdId: household.id,
      },
    });
    await prismaTest.receita.create({
      data: {
        pessoaId: gabi.id,
        subtipo: "SALARIO",
        valorCentavos: 600000,
        mes: new Date("2026-06-01"),
        householdId: household.id,
      },
    });
    await prismaTest.receita.create({
      data: {
        pessoaId: isa.id,
        subtipo: "SALARIO",
        valorCentavos: 700000,
        mes: new Date("2026-01-01"),
        householdId: household.id,
      },
    });

    const response = await GET(
      getRequest(
        cookie,
        `?pessoaId=${isa.id}&mesInicio=2026-06-01&mesFim=2026-06-30`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].valorCentavos).toBe(500000);
  });
});

describe("POST /api/receitas", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(401);
  });

  it("cria receita vinculada ao household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });

    const response = await POST(
      postRequest(
        {
          pessoaId: isa.id,
          subtipo: "SALARIO",
          valorCentavos: 500000,
          mes: "2026-06-15",
        },
        cookie,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.householdId).toBe(household.id);
    expect(body.mes).toBe("2026-06-01T00:00:00.000Z");
  });

  it("retorna 400 para valor negativo", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });

    const response = await POST(
      postRequest(
        {
          pessoaId: isa.id,
          subtipo: "SALARIO",
          valorCentavos: -500,
          mes: "2026-06-15",
        },
        cookie,
      ),
    );
    expect(response.status).toBe(400);
  });

  it("retorna 404 para pessoa de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const outraPessoa = await prismaTest.pessoa.create({
      data: {
        nome: "Intrusa",
        tipo: "INDIVIDUAL",
        householdId: outraHousehold.id,
      },
    });

    const response = await POST(
      postRequest(
        {
          pessoaId: outraPessoa.id,
          subtipo: "SALARIO",
          valorCentavos: 500000,
          mes: "2026-06-15",
        },
        cookie,
      ),
    );
    expect(response.status).toBe(404);
  });
});
