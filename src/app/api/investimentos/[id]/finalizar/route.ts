import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  FinalizarInvestimentoSchema,
  InvestimentoJaFinalizadoError,
  finalizarInvestimento,
} from "@/lib/domain/investimentos";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = FinalizarInvestimentoSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;

  try {
    const resultado = await finalizarInvestimento(
      prisma,
      session.householdId,
      id,
      validatedFields.data,
    );
    if (!resultado) {
      return NextResponse.json(
        { error: "Investimento não encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof InvestimentoJaFinalizadoError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
