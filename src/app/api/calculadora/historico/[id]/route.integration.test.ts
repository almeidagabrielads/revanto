import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { limparBanco, prismaTest } from "@/test/prisma";
import { SESSION_COOKIE, encryptSession } from "@/lib/auth/session";

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

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

function deleteRequest(id: string, cookie?: string) {
  return new NextRequest(`http://localhost/api/calculadora/historico/${id}`, {
    method: "DELETE",
    headers: cookie ? { cookie } : {},
  });
}

beforeAll(async () => {
  ({ DELETE } = await import("./route"));
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("DELETE /api/calculadora/historico/[id]", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await DELETE(deleteRequest("id-qualquer"), {
      params: Promise.resolve({ id: "id-qualquer" }),
    });
    expect(response.status).toBe(401);
  });

  it("remove um item do histórico do household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const item = await prismaTest.calculadoraHistorico.create({
      data: { householdId: household.id, expressao: "1 + 1", resultado: "2" },
    });

    const response = await DELETE(deleteRequest(item.id, cookie), {
      params: Promise.resolve({ id: item.id }),
    });
    expect(response.status).toBe(200);

    const restante = await prismaTest.calculadoraHistorico.findUnique({
      where: { id: item.id },
    });
    expect(restante).toBeNull();
  });

  it("retorna 404 para item de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const item = await prismaTest.calculadoraHistorico.create({
      data: {
        householdId: outraHousehold.id,
        expressao: "1 + 1",
        resultado: "2",
      },
    });

    const response = await DELETE(deleteRequest(item.id, cookie), {
      params: Promise.resolve({ id: item.id }),
    });
    expect(response.status).toBe(404);
  });
});
