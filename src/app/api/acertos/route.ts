import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { ResolverAcertoSchema, listarAcertos, registrarAcerto } from "@/lib/domain/acertos";
import { buscarSaldoDivisaoGrupo } from "@/lib/domain/split";
import { registrarAtividade } from "@/lib/domain/atividades";
import { rotularDispositivo } from "@/lib/auth/device";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const acertos = await listarAcertos(prisma, session.householdId);
  return NextResponse.json(acertos);
}

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = ResolverAcertoSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const { dataInicio, dataFim } = validatedFields.data;
  const resumo = await buscarSaldoDivisaoGrupo(prisma, session.householdId, {
    dataInicio,
    dataFim,
  });
  if (!resumo) {
    return NextResponse.json(
      {
        error:
          "É preciso ao menos duas pessoas do tipo Individual para registrar um acerto.",
      },
      { status: 400 },
    );
  }

  const criados = await registrarAcerto(prisma, session.householdId, {
    dataInicio,
    dataFim,
    transferencias: resumo.transferenciasSugeridas,
    resolvidoPorUserId: session.userId,
  });

  if (criados.length > 0) {
    await registrarAtividade(
      prisma,
      session.householdId,
      session.userId,
      "Resolveu acerto de contas",
      rotularDispositivo(request.headers.get("user-agent")),
    ).catch(() => {});
  }

  return NextResponse.json(criados, { status: 201 });
}
