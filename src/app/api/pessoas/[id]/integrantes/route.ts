import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { DefinirIntegrantesSchema, definirIntegrantes } from "@/lib/domain/pessoas";

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = DefinirIntegrantesSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const integrantes = await definirIntegrantes(
    prisma,
    session.householdId,
    id,
    validatedFields.data,
  );
  if (integrantes === null) {
    return NextResponse.json(
      {
        error:
          "Grupo inválido ou integrante inválido (verifique se o grupo não é do tipo INDIVIDUAL e se cada pessoa é INDIVIDUAL do mesmo household, sem repetição).",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(integrantes);
}
