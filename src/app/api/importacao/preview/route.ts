import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { gerarPreviewImportacao } from "@/lib/domain/import/importacao";

const PreviewSchema = z.object({
  bancoId: z.string().trim().min(1, "Banco é obrigatório."),
  templateId: z.string().trim().min(1, "Modelo de importação é obrigatório."),
  csv: z.string().min(1, "Arquivo CSV vazio."),
});

export async function POST(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedFields = PreviewSchema.safeParse(body);
  if (!validatedFields.success) {
    return NextResponse.json(
      { error: z.treeifyError(validatedFields.error) },
      { status: 400 },
    );
  }

  const resultado = await gerarPreviewImportacao(prisma, session.householdId, {
    bancoId: validatedFields.data.bancoId,
    templateId: validatedFields.data.templateId,
    csvTexto: validatedFields.data.csv,
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 400 });
  }

  return NextResponse.json(resultado);
}
