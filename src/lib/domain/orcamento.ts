import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { TipoGastoSchema } from "./tipoGasto";

export const CriarOrcamentoSchema = z.object({
  // Sempre uma Pessoa INDIVIDUAL (ver validarReferencias). O orçamento de um
  // grupo (CASAL/FAMILIA/OUTRO) não é armazenado — é a soma dos orçamentos
  // dos seus integrantes, calculada em src/lib/domain/relatorios.ts.
  pessoaId: z.string().trim().min(1, "Pessoa é obrigatória."),
  // Com quem esse gasto planejado é dividido (qualquer Pessoa, inclusive
  // grupo) — igual ao pessoaDivisaoId do Lancamento, mas opcional e
  // independente do pessoaId acima.
  divisaoId: z.string().trim().min(1).nullish(),
  categoriaId: z.string().trim().min(1, "Categoria é obrigatória."),
  subcategoriaId: z.string().trim().min(1).nullish(),
  // Valor vigente a partir desse mês, até o próximo mês com valor próprio.
  // null/ausente = legado (orçamento anual antigo), tratado como vigente
  // desde o mês 1.
  mes: z.number().int().min(1).max(12).nullish(),
  ano: z.number().int().min(2000).max(2100),
  valorCentavos: z
    .number()
    .int("Valor deve ser um inteiro em centavos.")
    .nonnegative("Valor não pode ser negativo."),
  tipoGasto: TipoGastoSchema,
});

export const AtualizarOrcamentoSchema = CriarOrcamentoSchema.partial();

export type CriarOrcamentoInput = z.infer<typeof CriarOrcamentoSchema>;
export type AtualizarOrcamentoInput = z.infer<typeof AtualizarOrcamentoSchema>;

export function listarOrcamentos(
  prisma: PrismaClient,
  householdId: string,
  opts: {
    pessoaId?: string;
    categoriaId?: string;
    subcategoriaId?: string;
    ano?: number;
    mes?: number | null;
  } = {},
) {
  return prisma.orcamentoPlanejado.findMany({
    where: {
      householdId,
      ...(opts.pessoaId !== undefined ? { pessoaId: opts.pessoaId } : {}),
      ...(opts.categoriaId ? { categoriaId: opts.categoriaId } : {}),
      ...(opts.subcategoriaId ? { subcategoriaId: opts.subcategoriaId } : {}),
      ...(opts.ano !== undefined ? { ano: opts.ano } : {}),
      ...(opts.mes !== undefined ? { mes: opts.mes } : {}),
    },
    orderBy: [{ ano: "desc" }, { mes: "asc" }],
  });
}

export function buscarOrcamento(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  return prisma.orcamentoPlanejado.findFirst({ where: { id, householdId } });
}

async function validarReferencias(
  prisma: PrismaClient,
  householdId: string,
  input: {
    pessoaId?: string | null;
    divisaoId?: string | null;
    categoriaId?: string;
    subcategoriaId?: string | null;
  },
) {
  if (input.pessoaId) {
    const pessoa = await prisma.pessoa.findFirst({
      where: { id: input.pessoaId, householdId },
    });
    if (!pessoa || pessoa.tipo !== "INDIVIDUAL") return false;
  }

  if (input.divisaoId) {
    const divisao = await prisma.pessoa.findFirst({
      where: { id: input.divisaoId, householdId },
    });
    if (!divisao) return false;
  }

  if (input.categoriaId) {
    const categoria = await prisma.categoria.findFirst({
      where: { id: input.categoriaId, householdId },
    });
    if (!categoria) return false;
  }

  if (input.subcategoriaId) {
    const subcategoria = await prisma.subcategoria.findFirst({
      where: {
        id: input.subcategoriaId,
        householdId,
        ...(input.categoriaId ? { categoriaId: input.categoriaId } : {}),
      },
    });
    if (!subcategoria) return false;
  }

  return true;
}

export async function criarOrcamento(
  prisma: PrismaClient,
  householdId: string,
  input: CriarOrcamentoInput,
) {
  const valido = await validarReferencias(prisma, householdId, input);
  if (!valido) return null;

  return prisma.orcamentoPlanejado.create({
    data: {
      categoriaId: input.categoriaId,
      valorCentavos: input.valorCentavos,
      ano: input.ano,
      pessoaId: input.pessoaId,
      divisaoId: input.divisaoId ?? null,
      subcategoriaId: input.subcategoriaId ?? null,
      mes: input.mes ?? null,
      tipoGasto: input.tipoGasto,
      householdId,
    },
  });
}

export async function atualizarOrcamento(
  prisma: PrismaClient,
  householdId: string,
  id: string,
  input: AtualizarOrcamentoInput,
) {
  const existente = await buscarOrcamento(prisma, householdId, id);
  if (!existente) return null;

  const valido = await validarReferencias(prisma, householdId, {
    pessoaId: input.pessoaId ?? undefined,
    divisaoId: input.divisaoId ?? undefined,
    categoriaId: input.categoriaId ?? existente.categoriaId,
    subcategoriaId: input.subcategoriaId ?? undefined,
  });
  if (!valido) return null;

  return prisma.orcamentoPlanejado.update({
    where: { id },
    data: input,
  });
}

export async function removerOrcamento(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  const existente = await buscarOrcamento(prisma, householdId, id);
  if (!existente) return null;

  return prisma.orcamentoPlanejado.delete({ where: { id } });
}
