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

async function criarBancoEPessoa(householdId: string) {
  const banco = await prismaTest.banco.create({
    data: { nome: "XP", tipo: "CORRETORA", householdId },
  });
  const pessoa = await prismaTest.pessoa.create({
    data: { nome: "Isa", tipo: "INDIVIDUAL", householdId },
  });
  return { banco, pessoa };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, cookie?: string, body?: unknown) {
  return new NextRequest("http://localhost/api/patrimonio/x", {
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

describe("GET /api/patrimonio/[id]", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(req("GET"), ctx("qualquer-id"));
    expect(response.status).toBe(401);
  });

  it("retorna 404 para posição de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const { banco, pessoa } = await criarBancoEPessoa(outraHousehold.id);
    const posicao = await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        mes: new Date("2026-01-01"),
        valorCentavos: 100_000_00,
        householdId: outraHousehold.id,
      },
    });

    const response = await GET(req("GET", cookie), ctx(posicao.id));
    expect(response.status).toBe(404);
  });

  it("retorna a posição do household correto", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, pessoa } = await criarBancoEPessoa(household.id);
    const posicao = await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        mes: new Date("2026-01-01"),
        valorCentavos: 100_000_00,
        householdId: household.id,
      },
    });

    const response = await GET(req("GET", cookie), ctx(posicao.id));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.valorCentavos).toBe(100_000_00);
  });
});

describe("PATCH /api/patrimonio/[id]", () => {
  it("atualiza o valor de uma posição", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, pessoa } = await criarBancoEPessoa(household.id);
    const posicao = await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        mes: new Date("2026-01-01"),
        valorCentavos: 100_000_00,
        householdId: household.id,
      },
    });

    const response = await PATCH(
      req("PATCH", cookie, { valorCentavos: 110_000_00 }),
      ctx(posicao.id),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.valorCentavos).toBe(110_000_00);
  });

  it("retorna 404 ao atualizar posição de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const { banco, pessoa } = await criarBancoEPessoa(outraHousehold.id);
    const posicao = await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        mes: new Date("2026-01-01"),
        valorCentavos: 100_000_00,
        householdId: outraHousehold.id,
      },
    });

    const response = await PATCH(
      req("PATCH", cookie, { valorCentavos: 1 }),
      ctx(posicao.id),
    );
    expect(response.status).toBe(404);
  });

  it("retorna 400 para payload inválido", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, pessoa } = await criarBancoEPessoa(household.id);
    const posicao = await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        mes: new Date("2026-01-01"),
        valorCentavos: 100_000_00,
        householdId: household.id,
      },
    });

    const response = await PATCH(
      req("PATCH", cookie, { valorCentavos: "não é número" }),
      ctx(posicao.id),
    );
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/patrimonio/[id]", () => {
  it("remove posição existente", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, pessoa } = await criarBancoEPessoa(household.id);
    const posicao = await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        mes: new Date("2026-01-01"),
        valorCentavos: 100_000_00,
        householdId: household.id,
      },
    });

    const response = await DELETE(req("DELETE", cookie), ctx(posicao.id));
    expect(response.status).toBe(200);

    const restante = await prismaTest.posicaoPatrimonio.findUnique({
      where: { id: posicao.id },
    });
    expect(restante).toBeNull();
  });

  it("retorna 404 ao remover posição de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const { banco, pessoa } = await criarBancoEPessoa(outraHousehold.id);
    const posicao = await prismaTest.posicaoPatrimonio.create({
      data: {
        bancoId: banco.id,
        pessoaId: pessoa.id,
        mes: new Date("2026-01-01"),
        valorCentavos: 100_000_00,
        householdId: outraHousehold.id,
      },
    });

    const response = await DELETE(req("DELETE", cookie), ctx(posicao.id));
    expect(response.status).toBe(404);
  });
});
