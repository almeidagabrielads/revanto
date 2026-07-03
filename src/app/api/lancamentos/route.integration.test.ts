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

function getRequest(cookie?: string, query = "") {
  return new NextRequest(`http://localhost/api/lancamentos${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost/api/lancamentos", {
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

describe("GET /api/lancamentos", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("lista apenas lançamentos do household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, isa } = await montarCadastros(household.id);
    await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-06-10"),
        valorCentavos: 1000,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: isa.id,
        householdId: household.id,
      },
    });
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const outrosCadastros = await montarCadastros(outraHousehold.id);
    await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-06-10"),
        valorCentavos: 999,
        bancoId: outrosCadastros.banco.id,
        pessoaDivisaoId: outrosCadastros.isa.id,
        pessoaPagouId: outrosCadastros.isa.id,
        householdId: outraHousehold.id,
      },
    });

    const response = await GET(getRequest(cookie));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].valorCentavos).toBe(1000);
  });

  it("filtra por período, categoria, pessoa e banco via query string", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { categoria, banco, isa } = await montarCadastros(household.id);
    await prismaTest.lancamento.create({
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
    await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-01-10"),
        valorCentavos: 2000,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: isa.id,
        householdId: household.id,
      },
    });

    const response = await GET(
      getRequest(
        cookie,
        `?dataInicio=2026-06-01&dataFim=2026-06-30&categoriaId=${categoria.id}&pessoaId=${isa.id}&bancoId=${banco.id}`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].valorCentavos).toBe(1000);
  });
});

describe("POST /api/lancamentos", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(401);
  });

  it("cria lançamento vinculado ao household da sessão", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { categoria, subcategoria, banco, isa } = await montarCadastros(
      household.id,
    );

    const response = await POST(
      postRequest(
        {
          data: "2026-06-10",
          descricaoOrigem: "SUPERMERCADO",
          valorCentavos: 15000,
          categoriaId: categoria.id,
          subcategoriaId: subcategoria.id,
          bancoId: banco.id,
          pessoaDivisaoId: isa.id,
          pessoaPagouId: isa.id,
        },
        cookie,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.householdId).toBe(household.id);
    expect(body.valorCentavos).toBe(15000);
  });

  it("aceita valor negativo (estorno)", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { banco, isa } = await montarCadastros(household.id);

    const response = await POST(
      postRequest(
        {
          data: "2026-06-10",
          valorCentavos: -5000,
          bancoId: banco.id,
          pessoaDivisaoId: isa.id,
          pessoaPagouId: isa.id,
        },
        cookie,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.valorCentavos).toBe(-5000);
  });

  it("retorna 400 quando campos obrigatórios faltam", async () => {
    const { cookie } = await criarHouseholdComSessao();

    const response = await POST(postRequest({ valorCentavos: 100 }, cookie));
    expect(response.status).toBe(400);
  });

  it("retorna 400 quando subcategoria não pertence à categoria informada", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { subcategoria, banco, isa } = await montarCadastros(household.id);
    const outraCategoria = await prismaTest.categoria.create({
      data: { nome: "Viagem", householdId: household.id },
    });

    const response = await POST(
      postRequest(
        {
          data: "2026-06-10",
          valorCentavos: 1000,
          categoriaId: outraCategoria.id,
          subcategoriaId: subcategoria.id,
          bancoId: banco.id,
          pessoaDivisaoId: isa.id,
          pessoaPagouId: isa.id,
        },
        cookie,
      ),
    );

    expect(response.status).toBe(400);
  });
});
