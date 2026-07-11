import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  CriarHistoricoSchema,
  adicionarHistorico,
  limparHistorico,
  listarHistorico,
} from "@/lib/domain/calculadora";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const historico = await listarHistorico(prisma, session.householdId);
  return NextResponse.json(historico);
}

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = CriarHistoricoSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const item = await adicionarHistorico(
    prisma,
    session.householdId,
    validatedFields.data,
  );
  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  await limparHistorico(prisma, session.householdId);
  return NextResponse.json({ success: true });
}
