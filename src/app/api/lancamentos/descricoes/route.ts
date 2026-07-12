import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { buscarSugestoesDescricao } from "@/lib/domain/lancamentos";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const termo = request.nextUrl.searchParams.get("q") ?? "";
  const sugestoes = await buscarSugestoesDescricao(
    prisma,
    session.householdId,
    termo,
  );
  return NextResponse.json(sugestoes);
}
