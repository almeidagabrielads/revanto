import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const CriarLancamentoSchema = z.object({
  data: z.coerce.date(),
  descricaoOrigem: z.string().trim().min(1).nullish(),
  descricaoPropria: z.string().trim().min(1).nullish(),
  // Positivo = despesa; negativo = estorno/crédito (RF05)
  valorCentavos: z.number().int("Valor deve ser um inteiro em centavos."),
  descontoCentavos: z
    .number()
    .int("Desconto deve ser um inteiro em centavos.")
    .min(0, "Desconto não pode ser negativo.")
    .default(0),
  categoriaId: z.string().trim().min(1).nullish(),
  subcategoriaId: z.string().trim().min(1).nullish(),
  bancoId: z.string().trim().min(1, "Banco é obrigatório."),
  pessoaDivisaoId: z.string().trim().min(1, "Divisão é obrigatória."),
  pessoaPagouId: z.string().trim().min(1, "Quem pagou é obrigatório."),
  pagoComResgateInvestimento: z.boolean().default(false),
  investimentoResgateId: z.string().trim().min(1).nullish(),
});

export const AtualizarLancamentoSchema = CriarLancamentoSchema.partial();

// descontoCentavos e pagoComResgateInvestimento ficam opcionais aqui (mesmo com
// default no schema Zod) — o valor default é aplicado tanto pelo zod (na rota)
// quanto pelo Prisma (no schema).
export type CriarLancamentoInput = Omit<
  z.infer<typeof CriarLancamentoSchema>,
  "descontoCentavos" | "pagoComResgateInvestimento"
> & { descontoCentavos?: number; pagoComResgateInvestimento?: boolean };
export type AtualizarLancamentoInput = z.infer<
  typeof AtualizarLancamentoSchema
>;

type ReferenciasLancamento = {
  bancoId: string;
  pessoaDivisaoId: string;
  pessoaPagouId: string;
  categoriaId?: string | null;
  subcategoriaId?: string | null;
  investimentoResgateId?: string | null;
};

// Confere que banco/pessoas pertencem ao household e que, se informada, a
// subcategoria pertence à categoria selecionada (regra de validação exigida).
async function referenciasValidas(
  prisma: PrismaClient,
  householdId: string,
  refs: ReferenciasLancamento,
): Promise<boolean> {
  const [banco, pessoaDivisao, pessoaPagou] = await Promise.all([
    prisma.banco.findFirst({ where: { id: refs.bancoId, householdId } }),
    prisma.pessoa.findFirst({
      where: { id: refs.pessoaDivisaoId, householdId },
    }),
    prisma.pessoa.findFirst({
      where: { id: refs.pessoaPagouId, householdId },
    }),
  ]);
  if (!banco || !pessoaDivisao || !pessoaPagou) return false;

  if (refs.subcategoriaId) {
    if (!refs.categoriaId) return false;
    const subcategoria = await prisma.subcategoria.findFirst({
      where: { id: refs.subcategoriaId, householdId },
    });
    if (!subcategoria || subcategoria.categoriaId !== refs.categoriaId) {
      return false;
    }
  }

  if (refs.categoriaId) {
    const categoria = await prisma.categoria.findFirst({
      where: { id: refs.categoriaId, householdId },
    });
    if (!categoria) return false;
  }

  if (refs.investimentoResgateId) {
    const investimento = await prisma.investimento.findFirst({
      where: { id: refs.investimentoResgateId, householdId },
    });
    if (!investimento) return false;
  }

  return true;
}

export function listarLancamentos(
  prisma: PrismaClient,
  householdId: string,
  opts: {
    dataInicio?: Date;
    dataFim?: Date;
    categoriaId?: string;
    subcategoriaId?: string;
    bancoId?: string;
    pessoaId?: string;
  } = {},
) {
  return prisma.lancamento.findMany({
    where: {
      householdId,
      ...(opts.dataInicio || opts.dataFim
        ? {
            data: {
              ...(opts.dataInicio ? { gte: opts.dataInicio } : {}),
              ...(opts.dataFim ? { lte: opts.dataFim } : {}),
            },
          }
        : {}),
      ...(opts.categoriaId ? { categoriaId: opts.categoriaId } : {}),
      ...(opts.subcategoriaId ? { subcategoriaId: opts.subcategoriaId } : {}),
      ...(opts.bancoId ? { bancoId: opts.bancoId } : {}),
      ...(opts.pessoaId
        ? {
            OR: [
              { pessoaDivisaoId: opts.pessoaId },
              { pessoaPagouId: opts.pessoaId },
            ],
          }
        : {}),
    },
    orderBy: { data: "desc" },
  });
}

// Valor efetivamente gasto de um lançamento — desconto reduz o valor pago
// (usado em relatórios/orçamento; não altera o valor armazenado).
export function valorLiquidoCentavos(lancamento: {
  valorCentavos: number;
  descontoCentavos: number;
}): number {
  return lancamento.valorCentavos - lancamento.descontoCentavos;
}

export function buscarLancamento(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  return prisma.lancamento.findFirst({ where: { id, householdId } });
}

export async function criarLancamento(
  prisma: PrismaClient,
  householdId: string,
  input: CriarLancamentoInput,
) {
  const valido = await referenciasValidas(prisma, householdId, input);
  if (!valido) return null;

  return prisma.lancamento.create({
    data: { ...input, householdId },
  });
}

export async function atualizarLancamento(
  prisma: PrismaClient,
  householdId: string,
  id: string,
  input: AtualizarLancamentoInput,
) {
  const existente = await buscarLancamento(prisma, householdId, id);
  if (!existente) return null;

  const refs: ReferenciasLancamento = {
    bancoId: input.bancoId ?? existente.bancoId,
    pessoaDivisaoId: input.pessoaDivisaoId ?? existente.pessoaDivisaoId,
    pessoaPagouId: input.pessoaPagouId ?? existente.pessoaPagouId,
    categoriaId:
      input.categoriaId !== undefined
        ? input.categoriaId
        : existente.categoriaId,
    subcategoriaId:
      input.subcategoriaId !== undefined
        ? input.subcategoriaId
        : existente.subcategoriaId,
    investimentoResgateId:
      input.investimentoResgateId !== undefined
        ? input.investimentoResgateId
        : existente.investimentoResgateId,
  };
  const valido = await referenciasValidas(prisma, householdId, refs);
  if (!valido) return null;

  return prisma.lancamento.update({
    where: { id },
    data: input,
  });
}

export async function removerLancamento(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  const existente = await buscarLancamento(prisma, householdId, id);
  if (!existente) return null;

  return prisma.lancamento.delete({ where: { id } });
}
