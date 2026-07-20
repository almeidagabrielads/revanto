export type Subcategoria = { id: string; nome: string; categoriaId: string };
export type Categoria = {
  id: string;
  nome: string;
  subcategorias: Subcategoria[];
};
export type Banco = { id: string; nome: string };
export type Pessoa = { id: string; nome: string; tipo: string };
export type Template = { id: string; nomeExibicao: string; descricao: string };
export type Investimento = { id: string; produto: string };

export type Lancamento = {
  id: string;
  data: string;
  descricaoPropria: string | null;
  descricaoOrigem: string | null;
  valorCentavos: number;
  descontoCentavos: number;
  categoriaId: string | null;
  subcategoriaId: string | null;
  bancoId: string;
  pessoaDivisaoId: string;
  pessoaPagouId: string;
  pagoComResgateInvestimento: boolean;
  investimentoResgateId: string | null;
  tipoGasto: string;
  parcelamentoId: string | null;
  numeroParcela: number | null;
  previsto: boolean;
};

export const MODOS_PARCELAMENTO = [
  {
    value: "GRADUAL",
    label: "Gradual",
    descricao: "Lança só a parcela atual, mês a mês.",
  },
  {
    value: "AVISTA",
    label: "À vista",
    descricao: "Lança o valor total agora, sem impacto futuro.",
  },
  {
    value: "PREVISAO",
    label: "Previsão",
    descricao: "Já lança todas as parcelas futuras, comprometendo o orçamento.",
  },
] as const;

export type LinhaPreview = {
  numeroLinha: number;
  data: string;
  descricaoOrigem: string;
  valorCentavos: number;
  descontoCentavos: number;
  descricaoPropria: string | null;
  hash: string;
  duplicado: boolean;
  categoriaSugeridaId: string | null;
  subcategoriaSugeridaId: string | null;
  bancoOrigem: string | null;
  categoriaOrigem: string | null;
  subcategoriaOrigem: string | null;
  divisaoOrigem: string | null;
  pagouOrigem: string | null;
  bancoSugeridoId: string | null;
  pessoaDivisaoSugeridaId: string | null;
  pessoaPagouSugeridaId: string | null;
  parcelaDetectada: { atual: number; total: number } | null;
};

export type ErroImportacao = { numeroLinha: number; motivo: string };

export type LinhaRevisao = LinhaPreview & {
  selecionada: boolean;
  categoriaId: string;
  subcategoriaId: string;
  bancoId: string;
  pessoaDivisaoId: string;
  pessoaPagouId: string;
  usarComoParcelamento: boolean;
  modoParcelamento: string;
};

export const SEM_CATEGORIA = "";

export const TIPOS_GASTO = [
  { value: "FIXO", label: "Fixo" },
  { value: "VARIAVEL", label: "Variável" },
  { value: "INVESTIMENTO", label: "Investimento" },
] as const;

export function labelTipoGasto(tipo: string): string {
  return TIPOS_GASTO.find((t) => t.value === tipo)?.label ?? tipo;
}

export function dataParaInputDate(data: string): string {
  return data.slice(0, 10);
}

export type { FormLancamento } from "@/lib/domain/lancamentos";

export const inputClass =
  "rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-1.5 text-sm focus:border-primary focus:outline-none";
