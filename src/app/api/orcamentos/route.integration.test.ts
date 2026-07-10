import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { limparBanco, prismaTest } from "@/test/prisma";
import { SESSION_COOKIE, encryptSession } from "@/lib/auth/session";

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

let GET: typeof import("./route").GET;
let POST: typeof import("./route").POST;

async function criarHouseholdComSessao(nome = `Casa ${Math.random()}`) {
  const household = await prismaTest.household.create({ data: { nome } });
  const token = encryptSession({
    userId: "user-fake",
    householdId: household.id,
    expiresAt: Date.now() + 60_000,
  });
  return { household, cookie: `${SESSION_COOKIE}=${token}` };
}

function getRequest(cookie?: string, query = "") {
  return new NextRequest(`http://localhost/api/orcamentos${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/orcamentos", {
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

describe("GET /api/orcamentos", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("lista apenas orçamentos do household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: household.id },
    });
    await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: isa.id,
        categoriaId: categoria.id,
        ano: 2026,
        valorCentavos: 150000,
        householdId: household.id,
      },
    });
    const { household: outraHousehold } = await criarHouseholdComSessao();
    const gabi = await prismaTest.pessoa.create({
      data: { nome: "Gabi", tipo: "INDIVIDUAL", householdId: outraHousehold.id },
    });
    const outraCategoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: outraHousehold.id },
    });
    await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: gabi.id,
        categoriaId: outraCategoria.id,
        ano: 2026,
        valorCentavos: 999,
        householdId: outraHousehold.id,
      },
    });

    const response = await GET(getRequest(cookie));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].valorCentavos).toBe(150000);
  });

  it("filtra por ano e mês", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: household.id },
    });
    await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: isa.id,
        categoriaId: categoria.id,
        ano: 2026,
        mes: 1,
        valorCentavos: 100000,
        householdId: household.id,
      },
    });
    await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: isa.id,
        categoriaId: categoria.id,
        ano: 2026,
        mes: 2,
        valorCentavos: 200000,
        householdId: household.id,
      },
    });

    const response = await GET(getRequest(cookie, "?ano=2026&mes=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].valorCentavos).toBe(100000);
  });

  it("filtra orçamentos por pessoa", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: household.id },
    });
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const gabi = await prismaTest.pessoa.create({
      data: { nome: "Gabi", tipo: "INDIVIDUAL", householdId: household.id },
    });
    await prismaTest.orcamentoPlanejado.create({
      data: {
        categoriaId: categoria.id,
        pessoaId: isa.id,
        ano: 2026,
        valorCentavos: 100000,
        householdId: household.id,
      },
    });
    await prismaTest.orcamentoPlanejado.create({
      data: {
        categoriaId: categoria.id,
        pessoaId: gabi.id,
        ano: 2026,
        valorCentavos: 500000,
        householdId: household.id,
      },
    });

    const response = await GET(getRequest(cookie, `?ano=2026&pessoaId=${isa.id}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].pessoaId).toBe(isa.id);
  });
});

describe("POST /api/orcamentos", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(401);
  });

  it("cria orçamento vinculado ao household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: household.id },
    });

    const response = await POST(
      postRequest(
        {
          pessoaId: isa.id,
          categoriaId: categoria.id,
          ano: 2026,
          mes: 6,
          valorCentavos: 150000,
          tipoGasto: "VARIAVEL",
        },
        cookie,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.householdId).toBe(household.id);
    expect(body.mes).toBe(6);
  });

  it("retorna 400 para valor negativo", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: household.id },
    });

    const response = await POST(
      postRequest(
        {
          pessoaId: isa.id,
          categoriaId: categoria.id,
          ano: 2026,
          valorCentavos: -500,
          tipoGasto: "VARIAVEL",
        },
        cookie,
      ),
    );
    expect(response.status).toBe(400);
  });

  it("retorna 404 para categoria de outro household", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    const { household: outraHousehold } = await criarHouseholdComSessao();
    const outraCategoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: outraHousehold.id },
    });

    const response = await POST(
      postRequest(
        {
          pessoaId: isa.id,
          categoriaId: outraCategoria.id,
          ano: 2026,
          valorCentavos: 1000,
          tipoGasto: "VARIAVEL",
        },
        cookie,
      ),
    );
    expect(response.status).toBe(404);
  });
});
