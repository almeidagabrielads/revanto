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

async function criarPessoaIndividual(householdId: string, nome = "Isa") {
  return prismaTest.pessoa.create({
    data: { nome, tipo: "INDIVIDUAL", householdId },
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, cookie?: string, body?: unknown) {
  return new NextRequest("http://localhost/api/orcamentos/x", {
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

describe("GET /api/orcamentos/[id]", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(req("GET"), ctx("qualquer-id"));
    expect(response.status).toBe(401);
  });

  it("retorna 404 para orçamento de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const isa = await criarPessoaIndividual(outraHousehold.id);
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: outraHousehold.id },
    });
    const orcamento = await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: isa.id,
        categoriaId: categoria.id,
        ano: 2026,
        valorCentavos: 500000,
        householdId: outraHousehold.id,
      },
    });

    const response = await GET(req("GET", cookie), ctx(orcamento.id));
    expect(response.status).toBe(404);
  });

  it("retorna o orçamento do household correto", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await criarPessoaIndividual(household.id);
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: household.id },
    });
    const orcamento = await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: isa.id,
        categoriaId: categoria.id,
        ano: 2026,
        valorCentavos: 500000,
        householdId: household.id,
      },
    });

    const response = await GET(req("GET", cookie), ctx(orcamento.id));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.valorCentavos).toBe(500000);
  });
});

describe("PATCH /api/orcamentos/[id]", () => {
  it("atualiza valor e mês", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await criarPessoaIndividual(household.id);
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: household.id },
    });
    const orcamento = await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: isa.id,
        categoriaId: categoria.id,
        ano: 2026,
        valorCentavos: 500000,
        householdId: household.id,
      },
    });

    const response = await PATCH(
      req("PATCH", cookie, { valorCentavos: 600000, mes: 3 }),
      ctx(orcamento.id),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.valorCentavos).toBe(600000);
    expect(body.mes).toBe(3);
  });

  it("retorna 404 ao atualizar orçamento de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const isa = await criarPessoaIndividual(outraHousehold.id);
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: outraHousehold.id },
    });
    const orcamento = await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: isa.id,
        categoriaId: categoria.id,
        ano: 2026,
        valorCentavos: 500000,
        householdId: outraHousehold.id,
      },
    });

    const response = await PATCH(
      req("PATCH", cookie, { valorCentavos: 100 }),
      ctx(orcamento.id),
    );
    expect(response.status).toBe(404);
  });

  it("retorna 400 para payload inválido", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await criarPessoaIndividual(household.id);
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: household.id },
    });
    const orcamento = await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: isa.id,
        categoriaId: categoria.id,
        ano: 2026,
        valorCentavos: 500000,
        householdId: household.id,
      },
    });

    const response = await PATCH(
      req("PATCH", cookie, { valorCentavos: -100 }),
      ctx(orcamento.id),
    );
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/orcamentos/[id]", () => {
  it("remove orçamento existente", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const isa = await criarPessoaIndividual(household.id);
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: household.id },
    });
    const orcamento = await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: isa.id,
        categoriaId: categoria.id,
        ano: 2026,
        valorCentavos: 500000,
        householdId: household.id,
      },
    });

    const response = await DELETE(req("DELETE", cookie), ctx(orcamento.id));
    expect(response.status).toBe(200);

    const restante = await prismaTest.orcamentoPlanejado.findUnique({
      where: { id: orcamento.id },
    });
    expect(restante).toBeNull();
  });

  it("retorna 404 ao remover orçamento de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const isa = await criarPessoaIndividual(outraHousehold.id);
    const categoria = await prismaTest.categoria.create({
      data: { nome: "Moradia", householdId: outraHousehold.id },
    });
    const orcamento = await prismaTest.orcamentoPlanejado.create({
      data: {
        pessoaId: isa.id,
        categoriaId: categoria.id,
        ano: 2026,
        valorCentavos: 500000,
        householdId: outraHousehold.id,
      },
    });

    const response = await DELETE(req("DELETE", cookie), ctx(orcamento.id));
    expect(response.status).toBe(404);
  });
});
