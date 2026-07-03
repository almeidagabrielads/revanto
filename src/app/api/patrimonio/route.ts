import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  CriarPosicaoPatrimonioSchema,
  criarPosicaoPatrimonio,
  listarPosicoesPatrimonio,
} from "@/lib/domain/patrimonio";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const ano = params.get("ano");
  const posicoes = await listarPosicoesPatrimonio(prisma, session.householdId, {
    bancoId: params.get("bancoId") ?? undefined,
    pessoaId: params.get("pessoaId") ?? undefined,
    ano: ano ? Number(ano) : undefined,
  });
  return NextResponse.json(posicoes);
}

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = CriarPosicaoPatrimonioSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const posicao = await criarPosicaoPatrimonio(
    prisma,
    session.householdId,
    validatedFields.data,
  );
  if (!posicao) {
    return NextResponse.json(
      { error: "Banco ou pessoa não encontrada." },
      { status: 404 },
    );
  }
  return NextResponse.json(posicao, { status: 201 });
}
