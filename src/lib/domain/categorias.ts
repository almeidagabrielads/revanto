import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const CriarCategoriaSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
});

export const AtualizarCategoriaSchema = CriarCategoriaSchema.partial();

export type CriarCategoriaInput = z.infer<typeof CriarCategoriaSchema>;
export type AtualizarCategoriaInput = z.infer<typeof AtualizarCategoriaSchema>;

export function listarCategorias(
  prisma: PrismaClient,
  householdId: string,
  opts: { incluirInativas?: boolean } = {},
) {
  return prisma.categoria.findMany({
    where: {
      householdId,
      ...(opts.incluirInativas ? {} : { ativo: true }),
    },
    include: { subcategorias: true },
    orderBy: { nome: "asc" },
  });
}

export function buscarCategoria(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  return prisma.categoria.findFirst({
    where: { id, householdId },
    include: { subcategorias: true },
  });
}

export function criarCategoria(
  prisma: PrismaClient,
  householdId: string,
  input: CriarCategoriaInput,
) {
  return prisma.categoria.create({
    data: { ...input, householdId },
  });
}

async function buscarCategoriaSimples(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  return prisma.categoria.findFirst({ where: { id, householdId } });
}

export async function atualizarCategoria(
  prisma: PrismaClient,
  householdId: string,
  id: string,
  input: AtualizarCategoriaInput,
) {
  const existente = await buscarCategoriaSimples(prisma, householdId, id);
  if (!existente) return null;

  return prisma.categoria.update({
    where: { id },
    data: input,
  });
}

export async function inativarCategoria(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  const existente = await buscarCategoriaSimples(prisma, householdId, id);
  if (!existente) return null;

  return prisma.categoria.update({
    where: { id },
    data: { ativo: false },
  });
}

export async function reativarCategoria(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  const existente = await buscarCategoriaSimples(prisma, householdId, id);
  if (!existente) return null;

  return prisma.categoria.update({
    where: { id },
    data: { ativo: true },
  });
}
