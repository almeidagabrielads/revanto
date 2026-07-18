import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const UpsertPosicaoInvestimentoSchema = z.object({
  investimentoId: z.string().trim().min(1, "Investimento é obrigatório."),
  mes: z.coerce.date(),
  valorCentavos: z.number().int().nonnegative(),
});

export type UpsertPosicaoInvestimentoInput = z.infer<
  typeof UpsertPosicaoInvestimentoSchema
>;

export const RemoverPosicaoInvestimentoSchema = z.object({
  investimentoId: z.string().trim().min(1, "Investimento é obrigatório."),
  mes: z.coerce.date(),
});

function inicioDoMes(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
}

/**
 * O valor atual do investimento deve sempre refletir o último mês
 * preenchido na carteira. Chamado após qualquer upsert/remoção de posição.
 */
async function sincronizarValorAtual(
  prisma: PrismaClient,
  householdId: string,
  investimentoId: string,
) {
  const ultimaPosicao = await prisma.posicaoInvestimento.findFirst({
    where: { householdId, investimentoId },
    orderBy: { mes: "desc" },
  });
  if (!ultimaPosicao) return;

  await prisma.investimento.update({
    where: { id: investimentoId },
    data: { valorAtualCentavos: ultimaPosicao.valorCentavos },
  });
}

export function listarPosicoesInvestimento(
  prisma: PrismaClient,
  householdId: string,
  opts: { ano: number },
) {
  const inicio = new Date(Date.UTC(opts.ano, 0, 1));
  const fim = new Date(Date.UTC(opts.ano, 11, 1));
  return prisma.posicaoInvestimento.findMany({
    where: { householdId, mes: { gte: inicio, lte: fim } },
    orderBy: { mes: "asc" },
  });
}

export async function upsertPosicaoInvestimento(
  prisma: PrismaClient,
  householdId: string,
  input: UpsertPosicaoInvestimentoInput,
) {
  const investimento = await prisma.investimento.findFirst({
    where: { id: input.investimentoId, householdId },
  });
  if (!investimento) return null;

  const mes = inicioDoMes(input.mes);
  const posicao = await prisma.posicaoInvestimento.upsert({
    where: {
      investimentoId_mes: { investimentoId: input.investimentoId, mes },
    },
    create: {
      investimentoId: input.investimentoId,
      mes,
      valorCentavos: input.valorCentavos,
      householdId,
    },
    update: { valorCentavos: input.valorCentavos },
  });

  await sincronizarValorAtual(prisma, householdId, input.investimentoId);

  return posicao;
}

export async function removerPosicaoInvestimento(
  prisma: PrismaClient,
  householdId: string,
  input: z.infer<typeof RemoverPosicaoInvestimentoSchema>,
) {
  const investimento = await prisma.investimento.findFirst({
    where: { id: input.investimentoId, householdId },
  });
  if (!investimento) return null;

  const mes = inicioDoMes(input.mes);
  const resultado = await prisma.posicaoInvestimento.deleteMany({
    where: { householdId, investimentoId: input.investimentoId, mes },
  });

  await sincronizarValorAtual(prisma, householdId, input.investimentoId);

  return resultado;
}
