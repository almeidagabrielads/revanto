import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { confirmarImportacao } from "@/lib/domain/import/importacao";

const LinhaSchema = z.object({
  data: z.string().trim().min(1),
  descricaoOrigem: z.string().trim().min(1),
  valorCentavos: z.number().int(),
  categoriaId: z.string().trim().min(1).nullish(),
  subcategoriaId: z.string().trim().min(1).nullish(),
});

const ConfirmarSchema = z.object({
  bancoId: z.string().trim().min(1, "Banco é obrigatório."),
  pessoaDivisaoId: z.string().trim().min(1, "Divisão é obrigatória."),
  pessoaPagouId: z.string().trim().min(1, "Quem pagou é obrigatório."),
  linhas: z.array(LinhaSchema).min(1, "Selecione ao menos uma linha."),
});

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = ConfirmarSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const resultado = await confirmarImportacao(prisma, session.householdId, {
    bancoId: validatedFields.data.bancoId,
    pessoaDivisaoId: validatedFields.data.pessoaDivisaoId,
    pessoaPagouId: validatedFields.data.pessoaPagouId,
    linhas: validatedFields.data.linhas,
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 400 });
  }

  return NextResponse.json(resultado, { status: 201 });
}
