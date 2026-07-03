import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  AtualizarSubcategoriaSchema,
  atualizarSubcategoria,
  buscarSubcategoria,
} from "@/lib/domain/subcategorias";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const subcategoria = await buscarSubcategoria(
    prisma,
    session.householdId,
    id,
  );
  if (!subcategoria) {
    return NextResponse.json(
      { error: "Subcategoria não encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json(subcategoria);
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
  const validatedFields = AtualizarSubcategoriaSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  try {
    const subcategoria = await atualizarSubcategoria(
      prisma,
      session.householdId,
      id,
      validatedFields.data,
    );
    if (!subcategoria) {
      return NextResponse.json(
        { error: "Subcategoria não encontrada." },
        { status: 404 },
      );
    }
    return NextResponse.json(subcategoria);
  } catch {
    return NextResponse.json(
      { error: "Já existe uma subcategoria com esse nome nessa categoria." },
      { status: 409 },
    );
  }
}
