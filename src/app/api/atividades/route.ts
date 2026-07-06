import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  RegistrarAtividadeSchema,
  listarAtividades,
  registrarAtividade,
} from "@/lib/domain/atividades";
import { rotularDispositivo } from "@/lib/auth/device";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const atividades = await listarAtividades(prisma, session.householdId);
  return NextResponse.json(atividades);
}

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = RegistrarAtividadeSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const atividade = await registrarAtividade(
    prisma,
    session.householdId,
    session.userId,
    validatedFields.data.acao,
    rotularDispositivo(request.headers.get("user-agent")),
  );
  return NextResponse.json(atividade, { status: 201 });
}
