"use client";

import { PessoaBadge } from "../../components/PessoaBadge";
import { centavosParaReais } from "@/lib/domain/formatacao";
import {
  dataParaInputDate,
  labelTipoGasto,
  type Lancamento,
  type Pessoa,
} from "./types";

type Props = {
  lancamento: Lancamento;
  pessoas: Pessoa[];
  nome: {
    banco: (id: string) => string;
    pessoa: (id: string) => string;
    categoria: (id: string | null) => string;
    subcategoria: (id: string | null) => string;
  };
  quantidadeParcelasTotal: number | null;
  onRemover: (lancamento: Lancamento) => Promise<boolean>;
  onAbrirDetalhe: () => void;
  selecionada: boolean;
};

export function LinhaLancamento({
  lancamento,
  pessoas,
  nome,
  quantidadeParcelasTotal,
  onRemover,
  onAbrirDetalhe,
  selecionada,
}: Props) {
  const valorLiquido = lancamento.valorCentavos - lancamento.descontoCentavos;
  const divisaoPessoa = pessoas.find(
    (p) => p.id === lancamento.pessoaDivisaoId,
  );

  return (
    <tr
      className={`hover:bg-surface-container-low cursor-pointer border-l-4 ${
        selecionada
          ? "border-l-primary bg-primary/5"
          : "border-outline-variant/60 border-b border-l-transparent"
      } ${lancamento.previsto ? "italic opacity-60" : ""}`}
      onClick={onAbrirDetalhe}
    >
      <td className="p-2 whitespace-nowrap">
        {dataParaInputDate(lancamento.data)}
      </td>
      <td className="max-w-xs p-2">
        <span className="flex items-center gap-1.5">
          <span
            className="truncate"
            title={
              lancamento.descricaoPropria ||
              lancamento.descricaoOrigem ||
              undefined
            }
          >
            {lancamento.descricaoPropria || lancamento.descricaoOrigem || "—"}
          </span>
          {lancamento.parcelamentoId && quantidadeParcelasTotal && (
            <span className="bg-secondary-container text-on-secondary-container shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold not-italic">
              {lancamento.numeroParcela ?? "—"}/{quantidadeParcelasTotal}
            </span>
          )}
          {lancamento.previsto && (
            <span className="text-on-surface-variant shrink-0 text-xs not-italic">
              previsto
            </span>
          )}
        </span>
      </td>
      <td className="data-tabular p-2 text-right whitespace-nowrap">
        R$ {centavosParaReais(valorLiquido)}
      </td>
      <td className="p-2 whitespace-nowrap">
        {nome.categoria(lancamento.categoriaId)}
      </td>
      <td className="p-2 whitespace-nowrap">
        {lancamento.subcategoriaId
          ? nome.subcategoria(lancamento.subcategoriaId)
          : "—"}
      </td>
      <td className="p-2 whitespace-nowrap">
        {nome.banco(lancamento.bancoId)}
      </td>
      <td className="p-2 whitespace-nowrap">
        {divisaoPessoa ? (
          <PessoaBadge
            nome={divisaoPessoa.nome}
            pessoaId={divisaoPessoa.id}
            compartilhado={divisaoPessoa.tipo !== "INDIVIDUAL"}
          />
        ) : (
          nome.pessoa(lancamento.pessoaDivisaoId)
        )}
      </td>
      <td className="p-2 whitespace-nowrap">
        {nome.pessoa(lancamento.pessoaPagouId)}
      </td>
      <td className="p-2 whitespace-nowrap">
        {labelTipoGasto(lancamento.tipoGasto)}
      </td>
      <td className="p-2" onClick={(e) => e.stopPropagation()}>
        <button
          className="text-danger hover:bg-surface-container rounded-full p-1.5 transition-colors"
          onClick={() => onRemover(lancamento)}
          title="Remover"
          aria-label="Remover"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </td>
    </tr>
  );
}
