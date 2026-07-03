import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/dal";
import { listarTemplates } from "@/lib/domain/import/templates";

export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const templates = listarTemplates().map((t) => ({
    id: t.id,
    nomeExibicao: t.nomeExibicao,
    descricao: t.descricao,
  }));
  return NextResponse.json(templates);
}
