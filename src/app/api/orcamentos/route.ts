import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  CriarOrcamentoSchema,
  criarOrcamento,
  listarOrcamentos,
} from "@/lib/domain/orcamento";
import { registrarAtividade } from "@/lib/domain/atividades";
import { rotularDispositivo } from "@/lib/auth/device";

function parseInt10(valor: string | null): number | undefined {
  if (valor === null) return undefined;
  const n = Number.parseInt(valor, 10);
  return Number.isNaN(n) ? undefined : n;
}

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const mesParam = params.get("mes");
  const pessoaIdParam = params.get("pessoaId");
  const orcamentos = await listarOrcamentos(prisma, session.householdId, {
    pessoaId:
      pessoaIdParam === null
        ? undefined
        : pessoaIdParam === "null"
          ? null
          : pessoaIdParam,
    categoriaId: params.get("categoriaId") ?? undefined,
    subcategoriaId: params.get("subcategoriaId") ?? undefined,
    ano: parseInt10(params.get("ano")),
    mes: mesParam === null ? undefined : (parseInt10(mesParam) ?? null),
  });
  return NextResponse.json(orcamentos);
}

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = CriarOrcamentoSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const orcamento = await criarOrcamento(
    prisma,
    session.householdId,
    validatedFields.data,
  );
  if (!orcamento) {
    return NextResponse.json(
      { error: "Pessoa, categoria ou subcategoria não encontrada." },
      { status: 404 },
    );
  }

  await registrarAtividade(
    prisma,
    session.householdId,
    session.userId,
    "Alterou orçamento",
    rotularDispositivo(request.headers.get("user-agent")),
  ).catch(() => {});

  return NextResponse.json(orcamento, { status: 201 });
}
