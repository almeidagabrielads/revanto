import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  CriarLancamentoSchema,
  criarLancamento,
  listarLancamentos,
} from "@/lib/domain/lancamentos";

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
  const lancamentos = await listarLancamentos(prisma, session.householdId, {
    dataInicio: parseData(params.get("dataInicio")),
    dataFim: parseData(params.get("dataFim")),
    categoriaId: params.get("categoriaId") ?? undefined,
    subcategoriaId: params.get("subcategoriaId") ?? undefined,
    bancoId: params.get("bancoId") ?? undefined,
    pessoaId: params.get("pessoaId") ?? undefined,
  });
  return NextResponse.json(lancamentos);
}

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = CriarLancamentoSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const lancamento = await criarLancamento(
    prisma,
    session.householdId,
    validatedFields.data,
  );
  if (!lancamento) {
    return NextResponse.json(
      {
        error:
          "Categoria, subcategoria, banco ou pessoa inválidos (verifique se pertencem ao household e se a subcategoria pertence à categoria selecionada).",
      },
      { status: 400 },
    );
  }
  return NextResponse.json(lancamento, { status: 201 });
}
