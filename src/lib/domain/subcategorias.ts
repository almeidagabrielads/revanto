import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const CriarSubcategoriaSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  categoriaId: z.string().trim().min(1, "Categoria é obrigatória."),
  orcamentoCentavos: z
    .number()
    .int()
    .min(0, "Orçamento não pode ser negativo.")
    .nullish(),
});

export const AtualizarSubcategoriaSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório.").optional(),
  orcamentoCentavos: z
    .number()
    .int()
    .min(0, "Orçamento não pode ser negativo.")
    .nullish(),
});

export type CriarSubcategoriaInput = z.infer<typeof CriarSubcategoriaSchema>;
export type AtualizarSubcategoriaInput = z.infer<
  typeof AtualizarSubcategoriaSchema
>;

export function listarSubcategorias(
  prisma: PrismaClient,
  householdId: string,
  opts: { categoriaId?: string; incluirInativas?: boolean } = {},
) {
  return prisma.subcategoria.findMany({
    where: {
      householdId,
      ...(opts.categoriaId ? { categoriaId: opts.categoriaId } : {}),
      ...(opts.incluirInativas ? {} : { ativo: true }),
    },
    orderBy: { nome: "asc" },
  });
}

export function buscarSubcategoria(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  return prisma.subcategoria.findFirst({ where: { id, householdId } });
}

export async function criarSubcategoria(
  prisma: PrismaClient,
  householdId: string,
  input: CriarSubcategoriaInput,
) {
  const categoria = await prisma.categoria.findFirst({
    where: { id: input.categoriaId, householdId },
  });
  if (!categoria) return null;

  return prisma.subcategoria.create({
    data: { ...input, householdId },
  });
}

export async function atualizarSubcategoria(
  prisma: PrismaClient,
  householdId: string,
  id: string,
  input: AtualizarSubcategoriaInput,
) {
  const existente = await buscarSubcategoria(prisma, householdId, id);
  if (!existente) return null;

  return prisma.subcategoria.update({
    where: { id },
    data: input,
  });
}

export async function inativarSubcategoria(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  const existente = await buscarSubcategoria(prisma, householdId, id);
  if (!existente) return null;

  return prisma.subcategoria.update({
    where: { id },
    data: { ativo: false },
  });
}

export async function reativarSubcategoria(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  const existente = await buscarSubcategoria(prisma, householdId, id);
  if (!existente) return null;

  return prisma.subcategoria.update({
    where: { id },
    data: { ativo: true },
  });
}
