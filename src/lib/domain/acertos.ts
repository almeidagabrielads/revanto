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

export const RegistrarRepasseSchema = z
  .object({
    deId: z.string().trim().min(1, "Origem é obrigatória."),
    paraId: z.string().trim().min(1, "Destino é obrigatório."),
    valorCentavos: z.number().int().positive("Valor deve ser maior que zero."),
    data: z.coerce.date(),
  })
  .refine((v) => v.deId !== v.paraId, {
    message: "Origem e destino devem ser pessoas diferentes.",
    path: ["paraId"],
  });

export type RegistrarRepasseInput = z.infer<typeof RegistrarRepasseSchema>;

/**
 * Registra uma transferência manual entre duas pessoas INDIVIDUAL (ex.: um
 * Pix) como um AcertoContas — mesma estrutura usada para transferências
 * sugeridas, mas com dataInicio/dataFim iguais à data informada, de forma
 * que ela só entre no saldo de períodos que contenham essa data (ver
 * `buscarSaldoDivisaoGrupo`/`aplicarAcertosResolvidos` em split.ts). Retorna
 * `null` se `deId`/`paraId` não forem pessoas INDIVIDUAL deste household.
 */
export async function registrarRepasse(
  prisma: PrismaClient,
  householdId: string,
  input: RegistrarRepasseInput & { resolvidoPorUserId: string },
) {
  const [de, para] = await Promise.all([
    prisma.pessoa.findFirst({
      where: { id: input.deId, householdId, tipo: "INDIVIDUAL" },
    }),
    prisma.pessoa.findFirst({
      where: { id: input.paraId, householdId, tipo: "INDIVIDUAL" },
    }),
  ]);
  if (!de || !para) return null;

  const [criado] = await registrarAcerto(prisma, householdId, {
    dataInicio: input.data,
    dataFim: input.data,
    transferencias: [
      { deId: input.deId, paraId: input.paraId, valorCentavos: input.valorCentavos },
    ],
    resolvidoPorUserId: input.resolvidoPorUserId,
  });
  return criado;
}
