import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { reativarSubcategoria } from "@/lib/domain/subcategorias";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const subcategoria = await reativarSubcategoria(
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
