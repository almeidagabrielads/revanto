import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  CriarCategoriaSchema,
  criarCategoria,
  listarCategorias,
} from "@/lib/domain/categorias";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const incluirInativas =
    request.nextUrl.searchParams.get("incluirInativas") === "true";
  const categorias = await listarCategorias(prisma, session.householdId, {
    incluirInativas,
  });
  return NextResponse.json(categorias);
}

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = CriarCategoriaSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  try {
    const categoria = await criarCategoria(
      prisma,
      session.householdId,
      validatedFields.data,
    );
    return NextResponse.json(categoria, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Já existe uma categoria com esse nome." },
      { status: 409 },
    );
  }
}
