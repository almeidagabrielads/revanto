import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Transferencia } from "./split";

export const ResolverAcertoSchema = z.object({
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
});

export type ResolverAcertoInput = z.infer<typeof ResolverAcertoSchema>;

export async function registrarAcerto(
  prisma: PrismaClient,
  householdId: string,
  input: {
    dataInicio: Date;
    dataFim: Date;
    transferencias: Transferencia[];
    resolvidoPorUserId: string;
  },
) {
  if (input.transferencias.length === 0) return [];

  await prisma.acertoContas.createMany({
    data: input.transferencias.map((t) => ({
      householdId,
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
      deId: t.deId,
      paraId: t.paraId,
      valorCentavos: t.valorCentavos,
      resolvidoPorUserId: input.resolvidoPorUserId,
    })),
  });

  return listarAcertos(prisma, householdId, input.transferencias.length);
}

export function listarAcertos(
  prisma: PrismaClient,
  householdId: string,
  limite = 10,
) {
  return prisma.acertoContas.findMany({
    where: { householdId },
    include: {
      de: { select: { id: true, nome: true } },
      para: { select: { id: true, nome: true } },
    },
    orderBy: { resolvidoEm: "desc" },
    take: limite,
  });
}
