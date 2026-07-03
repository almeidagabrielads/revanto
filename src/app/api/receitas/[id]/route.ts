import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  AtualizarReceitaSchema,
  atualizarReceita,
  buscarReceita,
  removerReceita,
} from "@/lib/domain/receitas";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const receita = await buscarReceita(prisma, session.householdId, id);
  if (!receita) {
    return NextResponse.json(
      { error: "Receita não encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json(receita);
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
  const validatedFields = AtualizarReceitaSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const existente = await buscarReceita(prisma, session.householdId, id);
  if (!existente) {
    return NextResponse.json(
      { error: "Receita não encontrada." },
      { status: 404 },
    );
  }

  const receita = await atualizarReceita(
    prisma,
    session.householdId,
    id,
    validatedFields.data,
  );
  if (!receita) {
    return NextResponse.json(
      { error: "Pessoa não encontrada." },
      { status: 404 },
    );
  }
  return NextResponse.json(receita);
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const receita = await removerReceita(prisma, session.householdId, id);
  if (!receita) {
    return NextResponse.json(
      { error: "Receita não encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
