import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  CriarInvestimentoSchema,
  criarInvestimento,
  listarInvestimentos,
} from "@/lib/domain/investimentos";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const investimentos = await listarInvestimentos(prisma, session.householdId, {
    pessoaId: params.get("pessoaId") ?? undefined,
    bancoId: params.get("bancoId") ?? undefined,
    tipo: params.get("tipo") ?? undefined,
    incluirFinalizados: params.get("incluirFinalizados") === "true",
  });
  return NextResponse.json(investimentos);
}

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = CriarInvestimentoSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const investimento = await criarInvestimento(
    prisma,
    session.householdId,
    validatedFields.data,
  );
  if (!investimento) {
    return NextResponse.json(
      { error: "Banco ou pessoa não encontrada." },
      { status: 404 },
    );
  }
  return NextResponse.json(investimento, { status: 201 });
}
