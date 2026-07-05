import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { buscarSaldoDivisaoGrupo } from "@/lib/domain/split";

function parseData(valor: string | null): Date | undefined {
  if (!valor) return undefined;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? undefined : data;
}

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const saldo = await buscarSaldoDivisaoGrupo(prisma, session.householdId, {
    dataInicio: parseData(params.get("dataInicio")),
    dataFim: parseData(params.get("dataFim")),
  });

  // null é um estado válido (ex.: casa com apenas uma pessoa cadastrada, ou
  // nenhuma pessoa do tipo Individual ainda) — não é um erro de configuração.
  return NextResponse.json(saldo);
}
