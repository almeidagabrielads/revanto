import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  AtualizarOrcamentoSchema,
  atualizarOrcamento,
  buscarOrcamento,
  removerOrcamento,
} from "@/lib/domain/orcamento";
import { registrarAtividade } from "@/lib/domain/atividades";
import { rotularDispositivo } from "@/lib/auth/device";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const orcamento = await buscarOrcamento(prisma, session.householdId, id);
  if (!orcamento) {
    return NextResponse.json(
      { error: "Orçamento não encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json(orcamento);
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
  const validatedFields = AtualizarOrcamentoSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const existente = await buscarOrcamento(prisma, session.householdId, id);
  if (!existente) {
    return NextResponse.json(
      { error: "Orçamento não encontrado." },
      { status: 404 },
    );
  }

  const orcamento = await atualizarOrcamento(
    prisma,
    session.householdId,
    id,
    validatedFields.data,
  );
  if (!orcamento) {
    return NextResponse.json(
      { error: "Pessoa, categoria ou subcategoria não encontrada." },
      { status: 404 },
    );
  }

  await registrarAtividade(
    prisma,
    session.householdId,
    session.userId,
    "Alterou orçamento",
    rotularDispositivo(request.headers.get("user-agent")),
  ).catch(() => {});

  return NextResponse.json(orcamento);
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
  const orcamento = await removerOrcamento(prisma, session.householdId, id);
  if (!orcamento) {
    return NextResponse.json(
      { error: "Orçamento não encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
