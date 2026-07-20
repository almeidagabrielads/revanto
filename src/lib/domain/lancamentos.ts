import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { resolverFracaoPorGrupo } from "./pessoas";
import { TipoGastoSchema } from "./tipoGasto";

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
  tipoGasto: TipoGastoSchema,
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

export async function listarLancamentos(
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
  // Divisão dela ou de um grupo (CASAL/FAMILIA) do qual participa — mesma
  // regra usada no resumo/saldo (ver resolverFracaoPorGrupo) — ou lançamentos
  // que ela pagou diretamente, mesmo com divisão em outra pessoa.
  const gruposDaPessoa = opts.pessoaId
    ? await resolverFracaoPorGrupo(prisma, householdId, opts.pessoaId)
    : undefined;

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
              {
                pessoaDivisaoId: {
                  in: [opts.pessoaId, ...(gruposDaPessoa?.keys() ?? [])],
                },
              },
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

  return prisma.$transaction(async (tx) => {
    const removido = await tx.lancamento.delete({ where: { id } });

    // Se essa era a última parcela ligada a um Parcelamento, o cabeçalho
    // fica órfão (sem nenhum lançamento) e continuaria aparecendo como
    // "em aberto" para sempre — remove-o junto.
    if (removido.parcelamentoId) {
      const restantes = await tx.lancamento.count({
        where: { parcelamentoId: removido.parcelamentoId },
      });
      if (restantes === 0) {
        await tx.parcelamento.delete({
          where: { id: removido.parcelamentoId },
        });
      }
    }

    return removido;
  });
}

// Primeiro e último dia do mês (0-indexado) no formato aceito por <input type="date">.
export function intervaloDoMes(
  ano: number,
  mes: number,
): { inicio: string; fim: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return {
    inicio: `${ano}-${pad(mes + 1)}-01`,
    fim: `${ano}-${pad(mes + 1)}-${pad(ultimoDia)}`,
  };
}

export type FormLancamento = {
  data: string;
  descricaoPropria: string;
  valor: string;
  desconto: string;
  categoriaId: string;
  subcategoriaId: string;
  bancoId: string;
  pessoaDivisaoId: string;
  pessoaPagouId: string;
  pagoComResgateInvestimento: boolean;
  investimentoResgateId: string;
  tipoGasto: string;
  parcelar: boolean;
  quantidadeParcelas: string;
  modoParcelamento: string;
};

// Validação do formulário de "novo lançamento" no client — não confunde com
// o schema Zod (CriarLancamentoSchema), que valida o payload já convertido
// para centavos no servidor.
export function validarFormLancamento(
  f: FormLancamento,
  reaisParaCentavosFn: (valor: string) => number,
): string | null {
  if (!f.data) return "Informe a data do lançamento.";
  if (!f.bancoId) return "Selecione o banco/cartão.";
  if (!f.pessoaPagouId) return "Selecione quem pagou.";
  if (!f.pessoaDivisaoId) return "Selecione a divisão.";
  if (f.valor.trim() === "" || reaisParaCentavosFn(f.valor) === 0) {
    return "Informe um valor diferente de zero.";
  }
  if (f.desconto.trim() !== "" && reaisParaCentavosFn(f.desconto) < 0) {
    return "Desconto não pode ser negativo.";
  }
  if (f.parcelar) {
    const quantidade = Number(f.quantidadeParcelas);
    if (!Number.isInteger(quantidade) || quantidade < 2) {
      return "Informe uma quantidade de parcelas válida (mínimo 2).";
    }
  }
  return null;
}

export type RequisicaoCriarLancamento = {
  url: string;
  body: Record<string, unknown>;
};

// Decide entre criar um Parcelamento (várias parcelas) ou um Lançamento
// simples, e monta o payload de cada rota — o componente só chama fetch.
export function montarRequisicaoCriarLancamento(
  f: FormLancamento,
  reaisParaCentavosFn: (valor: string) => number,
): RequisicaoCriarLancamento {
  if (f.parcelar) {
    return {
      url: "/api/parcelamentos",
      body: {
        descricaoPropria: f.descricaoPropria || null,
        valorParcelaCentavos: reaisParaCentavosFn(f.valor),
        quantidadeParcelas: Number(f.quantidadeParcelas),
        dataPrimeiraParcela: f.data,
        modo: f.modoParcelamento,
        categoriaId: f.categoriaId || null,
        subcategoriaId: f.subcategoriaId || null,
        bancoId: f.bancoId,
        pessoaDivisaoId: f.pessoaDivisaoId,
        pessoaPagouId: f.pessoaPagouId,
        tipoGasto: f.tipoGasto,
      },
    };
  }
  return {
    url: "/api/lancamentos",
    body: {
      data: f.data,
      descricaoPropria: f.descricaoPropria || null,
      valorCentavos: reaisParaCentavosFn(f.valor),
      descontoCentavos: reaisParaCentavosFn(f.desconto),
      categoriaId: f.categoriaId || null,
      subcategoriaId: f.subcategoriaId || null,
      bancoId: f.bancoId,
      pessoaDivisaoId: f.pessoaDivisaoId,
      pessoaPagouId: f.pessoaPagouId,
      pagoComResgateInvestimento: f.pagoComResgateInvestimento,
      investimentoResgateId: f.investimentoResgateId || null,
      tipoGasto: f.tipoGasto,
    },
  };
}

export type ErroImportacao = { numeroLinha: number; motivo: string };

// Monta o texto de resumo mostrado após o preview de importação (fora dele
// só a parte de manipulação de DOM/download do CSV de exemplo permanece na UI).
export function resumoImportacaoTexto(r: {
  novas: number;
  duplicadas: number;
  ignoradasAntesDoPeriodo: number;
  erros: ErroImportacao[];
}): string {
  const partes = [`${r.novas} pronto(s) para revisão`];
  if (r.duplicadas > 0) partes.push(`${r.duplicadas} duplicado(s)`);
  if (r.ignoradasAntesDoPeriodo > 0)
    partes.push(`${r.ignoradasAntesDoPeriodo} fora do período`);
  if (r.erros.length > 0) partes.push(`${r.erros.length} com erro de leitura`);
  return partes.join(", ") + ".";
}

export type SugestaoDescricao = {
  descricao: string;
  categoriaId: string | null;
  subcategoriaId: string | null;
  pessoaDivisaoId: string;
  tipoGasto: string;
};

// Normaliza para comparação de descrições ignorando maiúsculas/minúsculas e
// acentos gráficos (autocomplete não deve diferenciá-los).
export function normalizarDescricaoParaBusca(descricao: string): string {
  return descricao.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const MAX_LANCAMENTOS_HISTORICO_DESCRICAO = 500;
const MAX_SUGESTOES_DESCRICAO = 8;

// Sugestões de descrição para autocomplete ao lançar: entre os lançamentos
// anteriores do household cuja descrição (normalizada) contém o termo
// buscado, retorna uma por descrição distinta — a do lançamento mais recente
// com aquela descrição — já com categoria/subcategoria/divisão/tipo de gasto
// para preencher o formulário quando o usuário selecionar a sugestão.
export async function buscarSugestoesDescricao(
  prisma: PrismaClient,
  householdId: string,
  termo: string,
): Promise<SugestaoDescricao[]> {
  const termoNormalizado = normalizarDescricaoParaBusca(termo);
  if (!termoNormalizado) return [];

  const lancamentos = await prisma.lancamento.findMany({
    where: { householdId, descricaoPropria: { not: null } },
    select: {
      descricaoPropria: true,
      categoriaId: true,
      subcategoriaId: true,
      pessoaDivisaoId: true,
      tipoGasto: true,
    },
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    take: MAX_LANCAMENTOS_HISTORICO_DESCRICAO,
  });

  const vistos = new Set<string>();
  const sugestoes: SugestaoDescricao[] = [];
  for (const lancamento of lancamentos) {
    const descricao = lancamento.descricaoPropria as string;
    const chave = normalizarDescricaoParaBusca(descricao);
    if (!chave.includes(termoNormalizado) || vistos.has(chave)) continue;
    vistos.add(chave);
    sugestoes.push({
      descricao,
      categoriaId: lancamento.categoriaId,
      subcategoriaId: lancamento.subcategoriaId,
      pessoaDivisaoId: lancamento.pessoaDivisaoId,
      tipoGasto: lancamento.tipoGasto,
    });
    if (sugestoes.length >= MAX_SUGESTOES_DESCRICAO) break;
  }
  return sugestoes;
}
