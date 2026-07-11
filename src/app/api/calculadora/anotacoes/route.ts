import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  AtualizarAnotacaoSchema,
  atualizarAnotacao,
  obterOuCriarAnotacao,
} from "@/lib/domain/calculadora";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const anotacao = await obterOuCriarAnotacao(prisma, session.householdId);
  return NextResponse.json(anotacao);
}

export async function PATCH(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = AtualizarAnotacaoSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const anotacao = await atualizarAnotacao(
    prisma,
    session.householdId,
    validatedFields.data,
  );
  return NextResponse.json(anotacao);
}
