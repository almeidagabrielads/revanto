import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { limparBanco, prismaTest } from "@/test/prisma";
import { SESSION_COOKIE, encryptSession } from "@/lib/auth/session";

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

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

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(cookie?: string) {
  return new NextRequest("http://localhost/api/categorias/x/inativar", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
}

beforeAll(async () => {
  ({ POST } = await import("./route"));
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("POST /api/categorias/[id]/inativar", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await POST(req(), ctx("qualquer-id"));
    expect(response.status).toBe(401);
  });

  it("inativa a categoria sem excluí-la fisicamente", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Casa", householdId: household.id },
    });

    const response = await POST(req(cookie), ctx(categoria.id));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ativo).toBe(false);

    const aindaExiste = await prismaTest.categoria.findUnique({
      where: { id: categoria.id },
    });
    expect(aindaExiste).not.toBeNull();
  });

  it("retorna 404 para categoria de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Intrusa", householdId: outraHousehold.id },
    });

    const response = await POST(req(cookie), ctx(categoria.id));
    expect(response.status).toBe(404);
  });
});
