import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  AtualizarInvestimentoSchema,
  atualizarInvestimento,
  buscarInvestimento,
} from "@/lib/domain/investimentos";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const investimento = await buscarInvestimento(prisma, session.householdId, id);
  if (!investimento) {
    return NextResponse.json(
      { error: "Investimento não encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json(investimento);
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = AtualizarInvestimentoSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const existente = await buscarInvestimento(prisma, session.householdId, id);
  if (!existente) {
    return NextResponse.json(
      { error: "Investimento não encontrado." },
      { status: 404 },
    );
  }

  const investimento = await atualizarInvestimento(
    prisma,
    session.householdId,
    id,
    validatedFields.data,
  );
  if (!investimento) {
    return NextResponse.json(
      { error: "Banco ou pessoa não encontrada." },
      { status: 404 },
    );
  }
  return NextResponse.json(investimento);
}
