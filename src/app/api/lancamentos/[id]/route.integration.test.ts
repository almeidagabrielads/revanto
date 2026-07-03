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

async function montarCadastros(householdId: string) {
  const categoria = await prismaTest.categoria.create({
    data: { nome: "Casa", householdId },
  });
  const subcategoria = await prismaTest.subcategoria.create({
    data: { nome: "Energia", categoriaId: categoria.id, householdId },
  });
  const banco = await prismaTest.banco.create({
    data: { nome: "Nubank", tipo: "CARTAO_CREDITO", householdId },
  });
  const isa = await prismaTest.pessoa.create({
    data: { nome: "Isa", tipo: "INDIVIDUAL", householdId },
  });
  return { categoria, subcategoria, banco, isa };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, cookie?: string, body?: unknown) {
  return new NextRequest("http://localhost/api/lancamentos/x", {
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

describe("GET /api/lancamentos/[id]", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(req("GET"), ctx("qualquer-id"));
    expect(response.status).toBe(401);
  });

  it("retorna 404 para lançamento de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const { banco, isa } = await montarCadastros(outraHousehold.id);
    const lancamento = await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-06-10"),
        valorCentavos: 1000,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: isa.id,
        householdId: outraHousehold.id,
      },
    });

    const response = await GET(req("GET", cookie), ctx(lancamento.id));
    expect(response.status).toBe(404);
  });

  it("retorna o lançamento do household correto", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, isa } = await montarCadastros(household.id);
    const lancamento = await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-06-10"),
        valorCentavos: 1000,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: isa.id,
        householdId: household.id,
      },
    });

    const response = await GET(req("GET", cookie), ctx(lancamento.id));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.valorCentavos).toBe(1000);
  });
});

describe("PATCH /api/lancamentos/[id]", () => {
  it("atualiza lançamento existente", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, isa } = await montarCadastros(household.id);
    const lancamento = await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-06-10"),
        valorCentavos: 1000,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: isa.id,
        householdId: household.id,
      },
    });

    const response = await PATCH(
      req("PATCH", cookie, { valorCentavos: 2500 }),
      ctx(lancamento.id),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.valorCentavos).toBe(2500);
  });

  it("retorna 404 ao atualizar lançamento de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const { banco, isa } = await montarCadastros(outraHousehold.id);
    const lancamento = await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-06-10"),
        valorCentavos: 1000,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: isa.id,
        householdId: outraHousehold.id,
      },
    });

    const response = await PATCH(
      req("PATCH", cookie, { valorCentavos: 2500 }),
      ctx(lancamento.id),
    );
    expect(response.status).toBe(404);
  });

  it("retorna 400 ao trocar subcategoria por uma de outra categoria", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { categoria, banco, isa } = await montarCadastros(household.id);
    const outraCategoria = await prismaTest.categoria.create({
      data: { nome: "Viagem", householdId: household.id },
    });
    const subcategoriaDeOutra = await prismaTest.subcategoria.create({
      data: {
        nome: "Passagem",
        categoriaId: outraCategoria.id,
        householdId: household.id,
      },
    });
    const lancamento = await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-06-10"),
        valorCentavos: 1000,
        categoriaId: categoria.id,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: isa.id,
        householdId: household.id,
      },
    });

    const response = await PATCH(
      req("PATCH", cookie, { subcategoriaId: subcategoriaDeOutra.id }),
      ctx(lancamento.id),
    );

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/lancamentos/[id]", () => {
  it("remove lançamento existente", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, isa } = await montarCadastros(household.id);
    const lancamento = await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-06-10"),
        valorCentavos: 1000,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: isa.id,
        householdId: household.id,
      },
    });

    const response = await DELETE(req("DELETE", cookie), ctx(lancamento.id));
    expect(response.status).toBe(200);

    const restante = await prismaTest.lancamento.findUnique({
      where: { id: lancamento.id },
    });
    expect(restante).toBeNull();
  });

  it("retorna 404 ao remover lançamento de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const { banco, isa } = await montarCadastros(outraHousehold.id);
    const lancamento = await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-06-10"),
        valorCentavos: 1000,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: isa.id,
        householdId: outraHousehold.id,
      },
    });

    const response = await DELETE(req("DELETE", cookie), ctx(lancamento.id));
    expect(response.status).toBe(404);
  });
});
