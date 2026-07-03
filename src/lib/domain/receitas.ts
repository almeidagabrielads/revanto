import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const SubtipoReceitaSchema = z.enum(["SALARIO", "VOUCHER", "OUTROS"]);

export const CriarReceitaSchema = z.object({
  pessoaId: z.string().trim().min(1, "Pessoa é obrigatória."),
  subtipo: SubtipoReceitaSchema,
  valorCentavos: z
    .number()
    .int("Valor deve ser um inteiro em centavos.")
    .positive("Valor deve ser positivo."),
  mes: z.coerce.date(),
});

export const AtualizarReceitaSchema = CriarReceitaSchema.partial();

export type CriarReceitaInput = z.infer<typeof CriarReceitaSchema>;
export type AtualizarReceitaInput = z.infer<typeof AtualizarReceitaSchema>;

// Normaliza para o 1º dia do mês em UTC — representa o mês de competência.
function primeiroDiaMes(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
}

export function listarReceitas(
  prisma: PrismaClient,
  householdId: string,
  opts: { pessoaId?: string; mesInicio?: Date; mesFim?: Date } = {},
) {
  return prisma.receita.findMany({
    where: {
      householdId,
      ...(opts.pessoaId ? { pessoaId: opts.pessoaId } : {}),
      ...(opts.mesInicio || opts.mesFim
        ? {
            mes: {
              ...(opts.mesInicio
                ? { gte: primeiroDiaMes(opts.mesInicio) }
                : {}),
              ...(opts.mesFim ? { lte: primeiroDiaMes(opts.mesFim) } : {}),
            },
          }
        : {}),
    },
    orderBy: { mes: "desc" },
  });
}

export function buscarReceita(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  return prisma.receita.findFirst({ where: { id, householdId } });
}

export async function criarReceita(
  prisma: PrismaClient,
  householdId: string,
  input: CriarReceitaInput,
) {
  const pessoa = await prisma.pessoa.findFirst({
    where: { id: input.pessoaId, householdId },
  });
  if (!pessoa) return null;

  return prisma.receita.create({
    data: { ...input, mes: primeiroDiaMes(input.mes), householdId },
  });
}

export async function atualizarReceita(
  prisma: PrismaClient,
  householdId: string,
  id: string,
  input: AtualizarReceitaInput,
) {
  const existente = await buscarReceita(prisma, householdId, id);
  if (!existente) return null;

  if (input.pessoaId) {
    const pessoa = await prisma.pessoa.findFirst({
      where: { id: input.pessoaId, householdId },
    });
    if (!pessoa) return null;
  }

  return prisma.receita.update({
    where: { id },
    data: {
      ...input,
      ...(input.mes ? { mes: primeiroDiaMes(input.mes) } : {}),
    },
  });
}

export async function removerReceita(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  const existente = await buscarReceita(prisma, householdId, id);
  if (!existente) return null;

  return prisma.receita.delete({ where: { id } });
}
