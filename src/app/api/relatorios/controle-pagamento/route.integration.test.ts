import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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

function getRequest(url: string, cookie?: string) {
  return new NextRequest(url, {
    headers: cookie ? { cookie } : {},
  });
}

beforeAll(async () => {
  await limparBanco();
  ({ GET } = await import("./route"));
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("GET /api/relatorios/controle-pagamento", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(
      getRequest(
        "http://localhost/api/relatorios/controle-pagamento?dataInicio=2026-01-01&dataFim=2026-01-31",
      ),
    );
    expect(response.status).toBe(401);
  });

  it("retorna 400 quando dataInicio/dataFim estão ausentes", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const response = await GET(
      getRequest("http://localhost/api/relatorios/controle-pagamento", cookie),
    );
    expect(response.status).toBe(400);
  });

  it("retorna a matriz escopada ao household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    await prismaTest.pessoa.create({
      data: { nome: "Isa", tipo: "INDIVIDUAL", householdId: household.id },
    });
    await prismaTest.pessoa.create({
      data: { nome: "Gabi", tipo: "INDIVIDUAL", householdId: household.id },
    });

    const response = await GET(
      getRequest(
        "http://localhost/api/relatorios/controle-pagamento?dataInicio=2026-01-01&dataFim=2026-01-31",
        cookie,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meses).toEqual(["2026-01"]);
    expect(body.pagadores).toHaveLength(2);
    expect(body.linhas).toHaveLength(4);
  });
});
