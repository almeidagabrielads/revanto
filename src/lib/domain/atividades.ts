import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const RegistrarAtividadeSchema = z.object({
  acao: z.string().trim().min(1).max(120),
});

export function registrarAtividade(
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  acao: string,
  dispositivo: string | null,
) {
  return prisma.atividadeLog.create({
    data: { householdId, userId, acao, dispositivo },
  });
}

export function listarAtividades(
  prisma: PrismaClient,
  householdId: string,
  limite = 10,
) {
  return prisma.atividadeLog.findMany({
    where: { householdId },
    include: { user: { select: { id: true, nome: true } } },
    orderBy: { createdAt: "desc" },
    take: limite,
  });
}
