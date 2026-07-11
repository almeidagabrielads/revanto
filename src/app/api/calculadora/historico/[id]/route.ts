import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { removerHistoricoItem } from "@/lib/domain/calculadora";

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const item = await removerHistoricoItem(prisma, session.householdId, id);
  if (!item) {
    return NextResponse.json(
      { error: "Item de histórico não encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
