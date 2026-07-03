import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import { limparBanco, prismaTest } from "@/test/prisma";
import { SESSION_COOKIE, encryptSession } from "@/lib/auth/session";

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

let GET: typeof import("./route").GET;

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
  return new NextRequest(`http://localhost/api/patrimonio/rendimento${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

beforeAll(async () => {
  ({ GET } = await import("./route"));
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("GET /api/patrimonio/rendimento", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("retorna 400 para ano inválido", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const response = await GET(getRequest(cookie, "?ano=abc"));
    expect(response.status).toBe(400);
  });

  it("calcula o histórico de rendimento do household a partir das posições e do CDI cacheado", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const banco = await prismaTest.banco.create({
      data: { nome: "XP", tipo: "CORRETORA", householdId: household.id },
    });

    await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        mes: new Date("2026-01-01"),
        valorCentavos: 100_000_00,
        householdId: household.id,
      },
    });
    await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        mes: new Date("2026-02-01"),
        valorCentavos: 101_000_00,
        householdId: household.id,
      },
    });
    await prismaTest.cdiMensal.createMany({
      data: [
        { mes: new Date(Date.UTC(2026, 0, 1)), percentual: 0.9 },
        { mes: new Date(Date.UTC(2026, 1, 1)), percentual: 0.9 },
      ],
    });
    vi.stubGlobal("fetch", vi.fn());

    const response = await GET(getRequest(cookie, "?ano=2026"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[1].variacaoCentavos).toBe(1_000_00);
  });
});
