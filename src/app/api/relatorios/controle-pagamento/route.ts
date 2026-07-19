import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { buscarControlePagamento } from "@/lib/domain/controlePagamento";

function parseData(valor: string | null): Date | null {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const dataInicio = parseData(params.get("dataInicio"));
  const dataFim = parseData(params.get("dataFim"));
  if (!dataInicio || !dataFim) {
    return NextResponse.json(
      { error: "dataInicio e dataFim são obrigatórios." },
      { status: 400 },
    );
  }

  const controle = await buscarControlePagamento(prisma, session.householdId, {
    dataInicio,
    dataFim,
  });
  return NextResponse.json(controle);
}
