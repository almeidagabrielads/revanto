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
  async function criarDuasPessoas(householdId: string) {
    const isa = await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId },
    });
    const gabi = await prismaTest.pessoa.create({
      data: { nome: "Gabi", tipo: "INDIVIDUAL", householdId },
    });
    return { isa, gabi };
  }

  it("retorna 401 sem sessão", async () => {
    const response = await POST(
      postRequest({
        deId: "a",
        paraId: "b",
        valorCentavos: 1000,
        data: "2026-01-05",
      }),
    );
    expect(response.status).toBe(401);
  });

  it("retorna 400 para dados inválidos", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const response = await POST(
      postRequest(
        { deId: "a", paraId: "b", valorCentavos: "não é número", data: "2026-01-05" },
        cookie,
      ),
    );
    expect(response.status).toBe(400);
  });

  it("retorna 400 quando origem e destino são a mesma pessoa", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { gabi } = await criarDuasPessoas(household.id);
    const response = await POST(
      postRequest(
        { deId: gabi.id, paraId: gabi.id, valorCentavos: 1000, data: "2026-01-05" },
        cookie,
      ),
    );
    expect(response.status).toBe(400);
  });

  it("retorna 400 quando origem/destino não são pessoas Individual da casa", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const response = await POST(
      postRequest(
        {
          deId: "inexistente-1",
          paraId: "inexistente-2",
          valorCentavos: 1000,
          data: "2026-01-05",
        },
        cookie,
      ),
    );
    expect(response.status).toBe(400);
  });

  it("registra o repasse como acerto e retorna o registro criado", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { isa, gabi } = await criarDuasPessoas(household.id);

    const response = await POST(
      postRequest(
        {
          deId: gabi.id,
          paraId: isa.id,
          valorCentavos: 1_000_000,
          data: "2026-01-05",
        },
        cookie,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.deId).toBe(gabi.id);
    expect(body.paraId).toBe(isa.id);
    expect(body.valorCentavos).toBe(1_000_000);

    const historico = await prismaTest.acertoContas.findMany({
      where: { householdId: household.id },
    });
    expect(historico).toHaveLength(1);
    expect(historico[0].dataInicio).toEqual(historico[0].dataFim);
  });
});
