import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  ConvidarMembroSchema,
  PAPEIS_GESTORES,
  convidarMembro,
  listarMembros,
} from "@/lib/domain/usuarios";
import { registrarAtividade } from "@/lib/domain/atividades";
import { rotularDispositivo } from "@/lib/auth/device";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const membros = await listarMembros(prisma, session.householdId);
  return NextResponse.json(membros);
}

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const solicitante = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, nome: true },
  });
  if (!solicitante || !PAPEIS_GESTORES.includes(solicitante.role)) {
    return NextResponse.json(
      { error: "Apenas proprietários ou administradores podem convidar membros." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const validatedFields = ConvidarMembroSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const resultado = await convidarMembro(
    prisma,
    session.householdId,
    validatedFields.data,
  );
  if (resultado === "EMAIL_EM_USO") {
    return NextResponse.json(
      { error: "Já existe uma conta com esse e-mail." },
      { status: 409 },
    );
  }

  await registrarAtividade(
    prisma,
    session.householdId,
    session.userId,
    `Convidou ${resultado.nome} como membro`,
    rotularDispositivo(request.headers.get("user-agent")),
  ).catch(() => {});

  return NextResponse.json(resultado, { status: 201 });
}
