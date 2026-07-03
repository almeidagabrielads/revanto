import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  AtualizarCategoriaSchema,
  atualizarCategoria,
  buscarCategoria,
} from "@/lib/domain/categorias";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const categoria = await buscarCategoria(prisma, session.householdId, id);
  if (!categoria) {
    return NextResponse.json(
      { error: "Categoria não encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json(categoria);
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
  const validatedFields = AtualizarCategoriaSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  try {
    const categoria = await atualizarCategoria(
      prisma,
      session.householdId,
      id,
      validatedFields.data,
    );
    if (!categoria) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 },
      );
    }
    return NextResponse.json(categoria);
  } catch {
    return NextResponse.json(
      { error: "Já existe uma categoria com esse nome." },
      { status: 409 },
    );
  }
}
