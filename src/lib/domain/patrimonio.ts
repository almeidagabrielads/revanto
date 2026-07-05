import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

// ─── RF13: histórico mensal de posição de patrimônio por banco/titular ────────

export const CriarPosicaoPatrimonioSchema = z.object({
  bancoId: z.string().trim().min(1, "Banco é obrigatório."),
  // null/ausente = posição compartilhada da casa, sem titular individual.
  pessoaId: z.string().trim().min(1).nullish(),
  // Qualquer dia do mês de referência é aceito; normalizado para o dia 1.
  mes: z.coerce.date(),
  valorCentavos: z
    .number()
    .int("Valor deve ser um inteiro em centavos.")
    .nonnegative("Valor não pode ser negativo."),
});

export const AtualizarPosicaoPatrimonioSchema =
  CriarPosicaoPatrimonioSchema.partial();

export type CriarPosicaoPatrimonioInput = z.infer<
  typeof CriarPosicaoPatrimonioSchema
>;
export type AtualizarPosicaoPatrimonioInput = z.infer<
  typeof AtualizarPosicaoPatrimonioSchema
>;

function primeiroDiaDoMesUTC(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
}

export function listarPosicoesPatrimonio(
  prisma: PrismaClient,
  householdId: string,
  opts: {
    bancoId?: string;
    pessoaId?: string | null;
    ano?: number;
  } = {},
) {
  return prisma.posicaoPatrimonio.findMany({
    where: {
      householdId,
      ...(opts.bancoId ? { bancoId: opts.bancoId } : {}),
      ...(opts.pessoaId !== undefined ? { pessoaId: opts.pessoaId } : {}),
      ...(opts.ano !== undefined
        ? {
            mes: {
              gte: new Date(Date.UTC(opts.ano, 0, 1)),
              lte: new Date(Date.UTC(opts.ano, 11, 1)),
            },
          }
        : {}),
    },
    orderBy: [{ mes: "asc" }],
  });
}

export function buscarPosicaoPatrimonio(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  return prisma.posicaoPatrimonio.findFirst({ where: { id, householdId } });
}

async function validarReferencias(
  prisma: PrismaClient,
  householdId: string,
  input: { bancoId?: string; pessoaId?: string | null },
) {
  if (input.bancoId) {
    const banco = await prisma.banco.findFirst({
      where: { id: input.bancoId, householdId },
    });
    if (!banco) return false;
  }

  if (input.pessoaId) {
    const pessoa = await prisma.pessoa.findFirst({
      where: { id: input.pessoaId, householdId },
    });
    if (!pessoa) return false;
  }

  return true;
}

export async function criarPosicaoPatrimonio(
  prisma: PrismaClient,
  householdId: string,
  input: CriarPosicaoPatrimonioInput,
) {
  const valido = await validarReferencias(prisma, householdId, input);
  if (!valido) return null;

  return prisma.posicaoPatrimonio.create({
    data: {
      bancoId: input.bancoId,
      pessoaId: input.pessoaId ?? null,
      mes: primeiroDiaDoMesUTC(input.mes),
      valorCentavos: input.valorCentavos,
      householdId,
    },
  });
}

export async function atualizarPosicaoPatrimonio(
  prisma: PrismaClient,
  householdId: string,
  id: string,
  input: AtualizarPosicaoPatrimonioInput,
) {
  const existente = await buscarPosicaoPatrimonio(prisma, householdId, id);
  if (!existente) return null;

  const valido = await validarReferencias(prisma, householdId, {
    bancoId: input.bancoId,
    pessoaId: input.pessoaId ?? undefined,
  });
  if (!valido) return null;

  return prisma.posicaoPatrimonio.update({
    where: { id },
    data: {
      ...input,
      mes: input.mes ? primeiroDiaDoMesUTC(input.mes) : undefined,
    },
  });
}

export async function removerPosicaoPatrimonio(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  const existente = await buscarPosicaoPatrimonio(prisma, householdId, id);
  if (!existente) return null;

  return prisma.posicaoPatrimonio.delete({ where: { id } });
}
