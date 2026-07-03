import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { buscarHistoricoRendimento } from "@/lib/domain/rendimento";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const anoParam = params.get("ano");
  const ano = anoParam ? Number(anoParam) : new Date().getUTCFullYear();
  if (!Number.isInteger(ano)) {
    return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
  }

  const percentualCdiContratado = params.get("percentualCdiContratado");

  const historico = await buscarHistoricoRendimento(
    prisma,
    session.householdId,
    {
      ano,
      pessoaId: params.get("pessoaId") ?? undefined,
      percentualCdiContratado: percentualCdiContratado
        ? Number(percentualCdiContratado)
        : undefined,
    },
  );
  return NextResponse.json(historico);
}
