import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { hashPassword } from "@/lib/auth/password";

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

let POST: typeof import("./route").POST;

async function criarUsuario(email: string, senha: string) {
  const household = await prismaTest.household.create({
    data: { nome: `Casa de ${email}` },
  });
  const passwordHash = await hashPassword(senha);
  return prismaTest.user.create({
    data: {
      email,
      nome: "Usuária Teste",
      passwordHash,
      householdId: household.id,
    },
  });
}

function postJson(body: unknown) {
  return POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
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

describe("POST /api/auth/login", () => {
  it("autentica com credenciais válidas e seta cookie de sessão", async () => {
    await criarUsuario("gabi@example.com", "senha-correta-123");

    const response = await postJson({
      email: "gabi@example.com",
      password: "senha-correta-123",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.email).toBe("gabi@example.com");
    expect(body.passwordHash).toBeUndefined();

    const cookie = response.cookies.get("session");
    expect(cookie?.value).toBeTruthy();
  });

  it("rejeita senha incorreta", async () => {
    await criarUsuario("gabi@example.com", "senha-correta-123");

    const response = await postJson({
      email: "gabi@example.com",
      password: "senha-errada",
    });

    expect(response.status).toBe(401);
    expect(response.cookies.get("session")).toBeUndefined();
  });

  it("rejeita e-mail inexistente", async () => {
    const response = await postJson({
      email: "ninguem@example.com",
      password: "qualquer-coisa",
    });

    expect(response.status).toBe(401);
  });

  it("rejeita corpo inválido", async () => {
    const response = await postJson({ email: "nao-e-email", password: "" });
    expect(response.status).toBe(400);
  });
});
