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

async function montarCadastros(householdId: string) {
  const categoria = await prismaTest.categoria.create({
    data: { nome: "Casa", householdId },
  });
  const banco = await prismaTest.banco.create({
    data: { nome: "Nubank", tipo: "CARTAO_CREDITO", householdId },
  });
  const isa = await prismaTest.pessoa.create({
    data: { nome: "Isa", tipo: "INDIVIDUAL", householdId },
  });
  return { categoria, banco, isa };
}

function getRequest(cookie?: string, query = "") {
  return new NextRequest(
    `http://localhost/api/lancamentos/descricoes${query}`,
    { headers: cookie ? { cookie } : {} },
  );
}

beforeAll(async () => {
  ({ GET } = await import("./route"));
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("GET /api/lancamentos/descricoes", () => {
  it("retorna 401 sem sessão", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("retorna sugestões do household da sessão ignorando acentos/caixa", async () => {
    const { household, cookie } = await criarHouseholdComSessao();
    const { categoria, banco, isa } = await montarCadastros(household.id);
    await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-06-10"),
        descricaoPropria: "Padaria Açúcar",
        valorCentavos: 1500,
        categoriaId: categoria.id,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: isa.id,
        householdId: household.id,
      },
    });

    const response = await GET(getRequest(cookie, "?q=acucar"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].descricao).toBe("Padaria Açúcar");
    expect(body[0].categoriaId).toBe(categoria.id);
  });

  it("não retorna sugestões de outro household", async () => {
    const { cookie } = await criarHouseholdComSessao();
    const outraHousehold = await prismaTest.household.create({
      data: { nome: "Outra casa" },
    });
    const { banco, isa } = await montarCadastros(outraHousehold.id);
    await prismaTest.lancamento.create({
      data: {
        data: new Date("2026-06-10"),
        descricaoPropria: "Aluguel",
        valorCentavos: 150000,
        bancoId: banco.id,
        pessoaDivisaoId: isa.id,
        pessoaPagouId: isa.id,
        householdId: outraHousehold.id,
      },
    });

    const response = await GET(getRequest(cookie, "?q=alu"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(0);
  });
});
