import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  CriarSubcategoriaSchema,
  criarSubcategoria,
  listarSubcategorias,
} from "@/lib/domain/subcategorias";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const categoriaId =
    request.nextUrl.searchParams.get("categoriaId") ?? undefined;
  const incluirInativas =
    request.nextUrl.searchParams.get("incluirInativas") === "true";
  const subcategorias = await listarSubcategorias(prisma, session.householdId, {
    categoriaId,
    incluirInativas,
  });
  return NextResponse.json(subcategorias);
}

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = CriarSubcategoriaSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  try {
    const subcategoria = await criarSubcategoria(
      prisma,
      session.householdId,
      validatedFields.data,
    );
    if (!subcategoria) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 },
      );
    }
    return NextResponse.json(subcategoria, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Já existe uma subcategoria com esse nome nessa categoria." },
      { status: 409 },
    );
  }
}
