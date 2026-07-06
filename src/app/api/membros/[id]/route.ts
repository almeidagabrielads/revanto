import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import {
  AtualizarMembroSchema,
  PAPEIS_GESTORES,
  atualizarPapelMembro,
  buscarMembro,
  removerMembro,
} from "@/lib/domain/usuarios";
import { registrarAtividade } from "@/lib/domain/atividades";
import { rotularDispositivo } from "@/lib/auth/device";

async function autorizarGestor(session: { userId: string }) {
  const solicitante = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  });
  return !!solicitante && PAPEIS_GESTORES.includes(solicitante.role);
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (id === session.userId) {
    return NextResponse.json(
      { error: "Você não pode alterar seu próprio papel de acesso." },
      { status: 403 },
    );
  }
  if (!(await autorizarGestor(session))) {
    return NextResponse.json(
      { error: "Apenas proprietários ou administradores podem alterar o acesso." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const validatedFields = AtualizarMembroSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const resultado = await atualizarPapelMembro(
    prisma,
    session.householdId,
    id,
    validatedFields.data,
  );
  if (resultado === null) {
    return NextResponse.json(
      { error: "Membro não encontrado." },
      { status: 404 },
    );
  }
  if (resultado === "PROPRIETARIO_FIXO") {
    return NextResponse.json(
      { error: "O papel do(a) proprietário(a) não pode ser alterado." },
      { status: 403 },
    );
  }

  await registrarAtividade(
    prisma,
    session.householdId,
    session.userId,
    `Alterou o acesso de ${resultado.nome} para ${resultado.role}`,
    rotularDispositivo(request.headers.get("user-agent")),
  ).catch(() => {});

  return NextResponse.json(resultado);
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (id === session.userId) {
    return NextResponse.json(
      { error: "Você não pode remover a si mesmo(a)." },
      { status: 403 },
    );
  }
  if (!(await autorizarGestor(session))) {
    return NextResponse.json(
      { error: "Apenas proprietários ou administradores podem remover membros." },
      { status: 403 },
    );
  }

  const membro = await buscarMembro(prisma, session.householdId, id);
  const resultado = await removerMembro(prisma, session.householdId, id);
  if (resultado === null) {
    return NextResponse.json(
      { error: "Membro não encontrado." },
      { status: 404 },
    );
  }
  if (resultado === "PROPRIETARIO_FIXO") {
    return NextResponse.json(
      { error: "O(a) proprietário(a) não pode ser removido(a)." },
      { status: 403 },
    );
  }

  await registrarAtividade(
    prisma,
    session.householdId,
    session.userId,
    `Removeu ${membro?.nome ?? "um membro"} do acesso ao sistema`,
    rotularDispositivo(request.headers.get("user-agent")),
  ).catch(() => {});

  return NextResponse.json({ success: true });
}
