import { NextResponse } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";

const CadastroSchema = z.object({
  household: z.string().min(1, "Informe o nome da casa."),
  nome: z.string().min(1, "Informe seu nome."),
  email: z.email(),
  password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres."),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const validatedFields = CadastroSchema.safeParse(body);

  if (!validatedFields.success) {
    return NextResponse.json(
      { error: validatedFields.error.issues[0].message },
      { status: 400 },
    );
  }

  const { household, nome, email, password } = validatedFields.data;

  const [householdExiste, emailExiste] = await Promise.all([
    prisma.household.findUnique({ where: { nome: household } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  if (householdExiste) {
    return NextResponse.json(
      { error: "Já existe uma casa com esse nome." },
      { status: 409 },
    );
  }
  if (emailExiste) {
    return NextResponse.json(
      { error: "Já existe uma conta com esse e-mail." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      nome,
      passwordHash,
      role: "PROPRIETARIO",
      household: { create: { nome: household } },
    },
  });

  const response = NextResponse.json(
    { id: user.id, email: user.email, nome: user.nome },
    { status: 201 },
  );
  setSessionCookie(response, user.id, user.householdId);
  return response;
}
