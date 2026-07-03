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

async function criarBancoEPessoa(householdId: string) {
  const banco = await prismaTest.banco.create({
    data: { nome: "XP", tipo: "CORRETORA", householdId },
  });
  const pessoa = await prismaTest.pessoa.create({
    data: { nome: "Isa", tipo: "INDIVIDUAL", householdId },
  });
  return { banco, pessoa };
}

function getRequest(cookie?: string, query = "") {
  return new NextRequest(`http://localhost/api/patrimonio${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/patrimonio", {
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

describe("GET /api/patrimonio", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("lista apenas posições do household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, pessoa } = await criarBancoEPessoa(household.id);
    await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        mes: new Date("2026-01-01"),
        valorCentavos: 100_000_00,
        householdId: household.id,
      },
    });
    const { household: outraHousehold } = await criarHouseholdComSessao();
    const outros = await criarBancoEPessoa(outraHousehold.id);
    await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: outros.banco.id,
        pessoaId: outros.pessoa.id,
        mes: new Date("2026-01-01"),
        valorCentavos: 999,
        householdId: outraHousehold.id,
      },
    });

    const response = await GET(getRequest(cookie));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].valorCentavos).toBe(100_000_00);
  });

  it("filtra por ano", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, pessoa } = await criarBancoEPessoa(household.id);
    await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        mes: new Date("2025-12-01"),
        valorCentavos: 50_000_00,
        householdId: household.id,
      },
    });
    await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        mes: new Date("2026-01-01"),
        valorCentavos: 51_000_00,
        householdId: household.id,
      },
    });

    const response = await GET(getRequest(cookie, "?ano=2026"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].valorCentavos).toBe(51_000_00);
  });
});

describe("POST /api/patrimonio", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(401);
  });

  it("cria posição de patrimônio vinculada ao household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, pessoa } = await criarBancoEPessoa(household.id);

    const response = await POST(
      postRequest(
        {
          bancoId: banco.id,
          pessoaId: pessoa.id,
          mes: "2026-01-01",
          valorCentavos: 100_000_00,
        },
        cookie,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.householdId).toBe(household.id);
    expect(body.valorCentavos).toBe(100_000_00);
  });

  it("retorna 400 para payload inválido", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const response = await POST(postRequest({}, cookie));
    expect(response.status).toBe(400);
  });

  it("retorna 404 quando o banco não pertence ao household", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { pessoa } = await criarBancoEPessoa(household.id);
    const { household: outraHousehold } = await criarHouseholdComSessao();
    const { banco: bancoDeOutraCasa } = await criarBancoEPessoa(
      outraHousehold.id,
    );

    const response = await POST(
      postRequest(
        {
          bancoId: bancoDeOutraCasa.id,
          pessoaId: pessoa.id,
          mes: "2026-01-01",
          valorCentavos: 100_000_00,
        },
        cookie,
      ),
    );

    expect(response.status).toBe(404);
  });
});
