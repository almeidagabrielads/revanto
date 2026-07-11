import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

// Quantidade máxima de entradas mantidas no histórico por household — evita
// crescimento ilimitado de uma tabela que é só um bloco de rascunho.
const LIMITE_HISTORICO = 100;

export const CriarHistoricoSchema = z.object({
  expressao: z.string().trim().min(1, "Expressão é obrigatória."),
  resultado: z.string().trim().min(1, "Resultado é obrigatório."),
});

export const AtualizarAnotacaoSchema = z.object({
  texto: z.string(),
});

export type CriarHistoricoInput = z.infer<typeof CriarHistoricoSchema>;
export type AtualizarAnotacaoInput = z.infer<typeof AtualizarAnotacaoSchema>;

export function listarHistorico(prisma: PrismaClient, householdId: string) {
  return prisma.calculadoraHistorico.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
    take: LIMITE_HISTORICO,
  });
}

export async function adicionarHistorico(
  prisma: PrismaClient,
  householdId: string,
  input: CriarHistoricoInput,
) {
  const item = await prisma.calculadoraHistorico.create({
    data: { ...input, householdId },
  });

  const excedentes = await prisma.calculadoraHistorico.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
    skip: LIMITE_HISTORICO,
    select: { id: true },
  });
  if (excedentes.length > 0) {
    await prisma.calculadoraHistorico.deleteMany({
      where: { id: { in: excedentes.map((e) => e.id) } },
    });
  }

  return item;
}

export function limparHistorico(prisma: PrismaClient, householdId: string) {
  return prisma.calculadoraHistorico.deleteMany({ where: { householdId } });
}

export async function removerHistoricoItem(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  const existente = await prisma.calculadoraHistorico.findFirst({
    where: { id, householdId },
  });
  if (!existente) return null;

  return prisma.calculadoraHistorico.delete({ where: { id } });
}

// Cria a anotação com o padrão (texto vazio) na primeira leitura, já que todo
// household deve ter no máximo uma anotação da calculadora.
export function obterOuCriarAnotacao(
  prisma: PrismaClient,
  householdId: string,
) {
  return prisma.calculadoraAnotacao.upsert({
    where: { householdId },
    update: {},
    create: { householdId },
  });
}

export function atualizarAnotacao(
  prisma: PrismaClient,
  householdId: string,
  input: AtualizarAnotacaoInput,
) {
  return prisma.calculadoraAnotacao.upsert({
    where: { householdId },
    update: input,
    create: { householdId, ...input },
  });
}
