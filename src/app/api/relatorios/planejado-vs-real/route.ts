import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { buscarPlanejadoVsReal } from "@/lib/domain/relatorios";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const ano = Number.parseInt(params.get("ano") ?? "", 10);
  if (Number.isNaN(ano)) {
    return NextResponse.json(
      { error: "Parâmetro 'ano' é obrigatório e deve ser um inteiro." },
      { status: 400 },
    );
  }

  const resultado = await buscarPlanejadoVsReal(prisma, session.householdId, {
    ano,
    pessoaId: params.get("pessoaId") ?? undefined,
  });
  return NextResponse.json(resultado);
}
