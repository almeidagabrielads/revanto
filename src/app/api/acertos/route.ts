import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  RegistrarRepasseSchema,
  listarAcertos,
  registrarRepasse,
} from "@/lib/domain/acertos";
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
  const validatedFields = RegistrarRepasseSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const criado = await registrarRepasse(prisma, session.householdId, {
    ...validatedFields.data,
    resolvidoPorUserId: session.userId,
  });
  if (!criado) {
    return NextResponse.json(
      {
        error:
          "Origem e destino precisam ser pessoas do tipo Individual cadastradas nesta casa.",
      },
      { status: 400 },
    );
  }

  await registrarAtividade(
    prisma,
    session.householdId,
    session.userId,
    `Registrou repasse de ${criado.de.nome} para ${criado.para.nome}`,
    rotularDispositivo(request.headers.get("user-agent")),
  ).catch(() => {});

  return NextResponse.json(criado, { status: 201 });
}
