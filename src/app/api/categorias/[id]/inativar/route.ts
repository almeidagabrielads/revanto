import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { inativarCategoria } from "@/lib/domain/categorias";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const categoria = await inativarCategoria(prisma, session.householdId, id);
  if (!categoria) {
    return NextResponse.json(
      { error: "Categoria não encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json(categoria);
}
