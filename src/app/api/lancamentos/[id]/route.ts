import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  AtualizarLancamentoSchema,
  atualizarLancamento,
  buscarLancamento,
  removerLancamento,
} from "@/lib/domain/lancamentos";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const lancamento = await buscarLancamento(prisma, session.householdId, id);
  if (!lancamento) {
    return NextResponse.json(
      { error: "Lançamento não encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json(lancamento);
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
  const validatedFields = AtualizarLancamentoSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const existente = await buscarLancamento(prisma, session.householdId, id);
  if (!existente) {
    return NextResponse.json(
      { error: "Lançamento não encontrado." },
      { status: 404 },
    );
  }

  const lancamento = await atualizarLancamento(
    prisma,
    session.householdId,
    id,
    validatedFields.data,
  );
  if (!lancamento) {
    return NextResponse.json(
      {
        error:
          "Categoria, subcategoria, banco ou pessoa inválidos (verifique se pertencem ao household e se a subcategoria pertence à categoria selecionada).",
      },
      { status: 400 },
    );
  }
  return NextResponse.json(lancamento);
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
  const lancamento = await removerLancamento(prisma, session.householdId, id);
  if (!lancamento) {
    return NextResponse.json(
      { error: "Lançamento não encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
