import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  CriarReceitaSchema,
  criarReceita,
  listarReceitas,
} from "@/lib/domain/receitas";

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
  const receitas = await listarReceitas(prisma, session.householdId, {
    pessoaId: params.get("pessoaId") ?? undefined,
    mesInicio: parseData(params.get("mesInicio")),
    mesFim: parseData(params.get("mesFim")),
  });
  return NextResponse.json(receitas);
}

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = CriarReceitaSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const receita = await criarReceita(
    prisma,
    session.householdId,
    validatedFields.data,
  );
  if (!receita) {
    return NextResponse.json(
      { error: "Pessoa não encontrada." },
      { status: 404 },
    );
  }
  return NextResponse.json(receita, { status: 201 });
}
