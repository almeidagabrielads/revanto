import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { primeiroDiaMes } from "./receitas";

export const TipoInvestimentoValues = [
  "RENDA_FIXA",
  "FUNDO",
  "FGTS",
  "OUTRO",
] as const;

// Vencimento/liquidez é informado como D+n (liquidezDias) OU como data de
// vencimento (vencimento) — nunca ambos (RF12). FGTS costuma não ter nenhum
// dos dois (liquidez indefinida).
export const CriarInvestimentoSchema = z
  .object({
    bancoId: z.string().trim().min(1, "Banco é obrigatório."),
    tipo: z.enum(TipoInvestimentoValues),
    produto: z.string().trim().min(1, "Produto é obrigatório."),
    valorAtualCentavos: z.number().int("Valor deve ser um inteiro em centavos."),
    vencimento: z.coerce.date().nullish(),
    liquidezDias: z.number().int().nonnegative().nullish(),
    observacao: z.string().trim().nullish(),
    pessoaId: z.string().trim().min(1, "Titular é obrigatório."),
  })
  .refine((data) => !(data.vencimento && data.liquidezDias != null), {
    message: "Informe apenas vencimento ou liquidezDias, não ambos.",
    path: ["vencimento"],
  });

export const AtualizarInvestimentoSchema = z
  .object({
    bancoId: z.string().trim().min(1).optional(),
    tipo: z.enum(TipoInvestimentoValues).optional(),
    produto: z.string().trim().min(1).optional(),
    valorAtualCentavos: z.number().int().optional(),
    vencimento: z.coerce.date().nullish(),
    liquidezDias: z.number().int().nonnegative().nullish(),
    observacao: z.string().trim().nullish(),
    pessoaId: z.string().trim().min(1).optional(),
  })
  .refine((data) => !(data.vencimento && data.liquidezDias != null), {
    message: "Informe apenas vencimento ou liquidezDias, não ambos.",
    path: ["vencimento"],
  });

export type CriarInvestimentoInput = z.infer<typeof CriarInvestimentoSchema>;
export type AtualizarInvestimentoInput = z.infer<
  typeof AtualizarInvestimentoSchema
>;

export function listarInvestimentos(
  prisma: PrismaClient,
  householdId: string,
  opts: {
    pessoaId?: string;
    bancoId?: string;
    tipo?: string;
    incluirFinalizados?: boolean;
  } = {},
) {
  return prisma.investimento.findMany({
    where: {
      householdId,
      ...(opts.pessoaId ? { pessoaId: opts.pessoaId } : {}),
      ...(opts.bancoId ? { bancoId: opts.bancoId } : {}),
      ...(opts.tipo ? { tipo: opts.tipo as never } : {}),
      ...(opts.incluirFinalizados ? {} : { status: "ATIVO" }),
    },
    orderBy: { produto: "asc" },
  });
}

export function buscarInvestimento(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  return prisma.investimento.findFirst({ where: { id, householdId } });
}

async function validarReferencias(
  prisma: PrismaClient,
  householdId: string,
  input: { bancoId?: string; pessoaId?: string },
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

export async function criarInvestimento(
  prisma: PrismaClient,
  householdId: string,
  input: CriarInvestimentoInput,
) {
  const valido = await validarReferencias(prisma, householdId, input);
  if (!valido) return null;

  return prisma.investimento.create({
    data: {
      bancoId: input.bancoId,
      tipo: input.tipo,
      produto: input.produto,
      valorAtualCentavos: input.valorAtualCentavos,
      vencimento: input.vencimento ?? null,
      liquidezDias: input.liquidezDias ?? null,
      observacao: input.observacao ?? null,
      pessoaId: input.pessoaId,
      householdId,
    },
  });
}

export async function atualizarInvestimento(
  prisma: PrismaClient,
  householdId: string,
  id: string,
  input: AtualizarInvestimentoInput,
) {
  const existente = await buscarInvestimento(prisma, householdId, id);
  if (!existente) return null;

  const valido = await validarReferencias(prisma, householdId, {
    bancoId: input.bancoId,
    pessoaId: input.pessoaId,
  });
  if (!valido) return null;

  return prisma.investimento.update({
    where: { id },
    data: input,
  });
}

// ─── Finalização de investimentos ──────────────────────────────────────────
//
// Um investimento nunca é apagado: ele é resgatado. O valor resgatado que
// não for reinvestido vira uma Receita (subtipo INVESTIMENTO); a parte
// reinvestida cria um novo Investimento vinculado ao original por
// investimentoOrigemId, preservando a cadeia histórica.

export const FinalizarInvestimentoSchema = z
  .object({
    valorResgatadoCentavos: z.number().int().nonnegative(),
    valorReinvestidoCentavos: z.number().int().nonnegative().default(0),
    criarReceita: z.boolean().default(true),
    mesReceita: z.coerce.date().optional(),
    novoInvestimento: z
      .object({
        bancoId: z.string().trim().min(1, "Banco é obrigatório."),
        tipo: z.enum(TipoInvestimentoValues),
        produto: z.string().trim().min(1, "Produto é obrigatório."),
        vencimento: z.coerce.date().nullish(),
        liquidezDias: z.number().int().nonnegative().nullish(),
        observacao: z.string().trim().nullish(),
      })
      .refine((data) => !(data.vencimento && data.liquidezDias != null), {
        message: "Informe apenas vencimento ou liquidezDias, não ambos.",
        path: ["vencimento"],
      })
      .optional(),
  })
  .refine(
    (data) => data.valorReinvestidoCentavos <= data.valorResgatadoCentavos,
    {
      message: "Valor reinvestido não pode ser maior que o valor resgatado.",
      path: ["valorReinvestidoCentavos"],
    },
  )
  .refine(
    (data) => data.valorReinvestidoCentavos === 0 || !!data.novoInvestimento,
    {
      message: "Dados do novo investimento são obrigatórios ao reinvestir.",
      path: ["novoInvestimento"],
    },
  );

export type FinalizarInvestimentoInput = z.infer<
  typeof FinalizarInvestimentoSchema
>;

export class InvestimentoJaFinalizadoError extends Error {
  constructor() {
    super("Investimento já finalizado.");
    this.name = "InvestimentoJaFinalizadoError";
  }
}

export async function finalizarInvestimento(
  prisma: PrismaClient,
  householdId: string,
  id: string,
  input: FinalizarInvestimentoInput,
) {
  const existente = await buscarInvestimento(prisma, householdId, id);
  if (!existente) return null;

  if (existente.status === "FINALIZADO") {
    throw new InvestimentoJaFinalizadoError();
  }

  const valorLiquidoCentavos =
    input.valorResgatadoCentavos - input.valorReinvestidoCentavos;

  return prisma.$transaction(async (tx) => {
    const novoInvestimento =
      input.valorReinvestidoCentavos > 0 && input.novoInvestimento
        ? await tx.investimento.create({
            data: {
              bancoId: input.novoInvestimento.bancoId,
              tipo: input.novoInvestimento.tipo,
              produto: input.novoInvestimento.produto,
              valorAtualCentavos: input.valorReinvestidoCentavos,
              vencimento: input.novoInvestimento.vencimento ?? null,
              liquidezDias: input.novoInvestimento.liquidezDias ?? null,
              observacao: input.novoInvestimento.observacao ?? null,
              pessoaId: existente.pessoaId,
              householdId,
              investimentoOrigemId: existente.id,
            },
          })
        : null;

    const receita =
      input.criarReceita && valorLiquidoCentavos > 0
        ? await tx.receita.create({
            data: {
              pessoaId: existente.pessoaId,
              subtipo: "INVESTIMENTO",
              descricao: `Resgate: ${existente.produto}`,
              valorCentavos: valorLiquidoCentavos,
              mes: primeiroDiaMes(input.mesReceita ?? new Date()),
              householdId,
              investimentoId: existente.id,
            },
          })
        : null;

    const investimento = await tx.investimento.update({
      where: { id },
      data: {
        status: "FINALIZADO",
        finalizadoEm: new Date(),
        valorResgatadoCentavos: input.valorResgatadoCentavos,
        valorReinvestidoCentavos: input.valorReinvestidoCentavos,
      },
    });

    return { investimento, novoInvestimento, receita };
  });
}

// ─── Liquidez consolidada (RF15) ────────────────────────────────────────────

export const FAIXAS_LIQUIDEZ = [
  "IMEDIATO", // D+0
  "ATE_30_DIAS",
  "ATE_90_DIAS",
  "ATE_180_DIAS",
  "ATE_365_DIAS",
  "MAIS_DE_1_ANO",
  "INDEFINIDO", // sem vencimento nem liquidezDias (ex.: FGTS)
] as const;

export type FaixaLiquidez = (typeof FAIXAS_LIQUIDEZ)[number];

function diasParaFaixa(dias: number | null): FaixaLiquidez {
  if (dias === null) return "INDEFINIDO";
  if (dias <= 0) return "IMEDIATO";
  if (dias <= 30) return "ATE_30_DIAS";
  if (dias <= 90) return "ATE_90_DIAS";
  if (dias <= 180) return "ATE_180_DIAS";
  if (dias <= 365) return "ATE_365_DIAS";
  return "MAIS_DE_1_ANO";
}

function diasAteResgate(
  investimento: { liquidezDias: number | null; vencimento: Date | null },
  dataReferencia: Date,
): number | null {
  if (investimento.liquidezDias !== null) return investimento.liquidezDias;
  if (investimento.vencimento !== null) {
    const msPorDia = 1000 * 60 * 60 * 24;
    const diff = Math.ceil(
      (investimento.vencimento.getTime() - dataReferencia.getTime()) /
        msPorDia,
    );
    return Math.max(diff, 0);
  }
  return null;
}

export type LiquidezConsolidada = {
  faixa: FaixaLiquidez;
  totalCentavos: number;
  investimentos: { id: string; produto: string; valorAtualCentavos: number }[];
}[];

export async function liquidezConsolidada(
  prisma: PrismaClient,
  householdId: string,
  opts: { pessoaId?: string; dataReferencia?: Date } = {},
): Promise<LiquidezConsolidada> {
  const dataReferencia = opts.dataReferencia ?? new Date();
  const investimentos = await prisma.investimento.findMany({
    where: {
      householdId,
      status: "ATIVO",
      ...(opts.pessoaId ? { pessoaId: opts.pessoaId } : {}),
    },
  });

  const porFaixa = new Map<
    FaixaLiquidez,
    { totalCentavos: number; investimentos: { id: string; produto: string; valorAtualCentavos: number }[] }
  >();
  for (const faixa of FAIXAS_LIQUIDEZ) {
    porFaixa.set(faixa, { totalCentavos: 0, investimentos: [] });
  }

  for (const inv of investimentos) {
    const faixa = diasParaFaixa(diasAteResgate(inv, dataReferencia));
    const grupo = porFaixa.get(faixa)!;
    grupo.totalCentavos += inv.valorAtualCentavos;
    grupo.investimentos.push({
      id: inv.id,
      produto: inv.produto,
      valorAtualCentavos: inv.valorAtualCentavos,
    });
  }

  return FAIXAS_LIQUIDEZ.map((faixa) => ({
    faixa,
    ...porFaixa.get(faixa)!,
  }));
}
