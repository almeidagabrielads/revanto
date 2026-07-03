import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  AtualizarPosicaoPatrimonioSchema,
  atualizarPosicaoPatrimonio,
  buscarPosicaoPatrimonio,
  removerPosicaoPatrimonio,
} from "@/lib/domain/patrimonio";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const posicao = await buscarPosicaoPatrimonio(
    prisma,
    session.householdId,
    id,
  );
  if (!posicao) {
    return NextResponse.json(
      { error: "Posição de patrimônio não encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json(posicao);
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
  const validatedFields = AtualizarPosicaoPatrimonioSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const existente = await buscarPosicaoPatrimonio(
    prisma,
    session.householdId,
    id,
  );
  if (!existente) {
    return NextResponse.json(
      { error: "Posição de patrimônio não encontrada." },
      { status: 404 },
    );
  }

  const posicao = await atualizarPosicaoPatrimonio(
    prisma,
    session.householdId,
    id,
    validatedFields.data,
  );
  if (!posicao) {
    return NextResponse.json(
      { error: "Banco ou pessoa não encontrada." },
      { status: 404 },
    );
  }
  return NextResponse.json(posicao);
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
  const posicao = await removerPosicaoPatrimonio(
    prisma,
    session.householdId,
    id,
  );
  if (!posicao) {
    return NextResponse.json(
      { error: "Posição de patrimônio não encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
