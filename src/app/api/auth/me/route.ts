import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/dal";
import { rotularDispositivo } from "@/lib/auth/device";

// Rota protegida de referência: exige sessão válida.
// Também funciona como heartbeat de presença: é chamada pelo <Nav /> em toda
// navegação, então aproveitamos para atualizar lastSeenAt/lastDevice.
export async function GET(request: NextRequest) {
  const session = verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const existente = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true },
  });
  if (!existente) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: {
      lastSeenAt: new Date(),
      lastDevice: rotularDispositivo(request.headers.get("user-agent")),
    },
    select: {
      id: true,
      email: true,
      nome: true,
      householdId: true,
      role: true,
    },
  });

  return NextResponse.json(user);
}
