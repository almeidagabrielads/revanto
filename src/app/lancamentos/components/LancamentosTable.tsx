"use client";

import { ColumnHeader } from "../../components/ColumnHeader";
import { Select } from "../../components/Select";
import type { Ordenacao, FiltroColuna } from "@/lib/domain/tabela";
import { LinhaLancamento } from "./LinhaLancamento";
import { DetalheLancamentoDrawer } from "./DetalheLancamentoDrawer";
import type {
  Banco,
  Categoria,
  Investimento,
  Lancamento,
  Pessoa,
} from "./types";

const NOMES_MESES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

type Nome = {
  banco: (id: string) => string;
  pessoa: (id: string) => string;
  categoria: (id: string | null) => string;
  subcategoria: (id: string | null) => string;
};

type OpcoesColunas = {
  categoria: string[];
  subcategoria: string[];
  banco: string[];
  divisao: string[];
  pagou: string[];
  tipoGasto: string[];
};

type Props = {
  anoFiltroMeses: number;
  anosDisponiveis: number[];
  mesFiltroSelecionado: number | null;
  onMudarAno: (ano: number) => void;
  onMudarMes: (mes: number | null) => void;

  lancamentos: Lancamento[] | null;
  lancamentosProcessados: Lancamento[];
  nome: Nome;
  opcoesColunas: OpcoesColunas;
  ordenacao: Ordenacao | null;
  onOrdenar: (chave: string) => void;
  filtros: Record<string, FiltroColuna>;
  onFiltrar: (chave: string, filtro: FiltroColuna) => void;
  onLimparFiltro: (chave: string) => void;

  paginaLancamentos: number;
  tamanhoPagina: number;
  onMudarPagina: (pagina: number) => void;

  pessoas: Pessoa[];
  categorias: Categoria[];
  bancos: Banco[];
  investimentos: Investimento[];
  parcelamentosPorId: Map<string, number>;
  onRemoverLancamento: (lancamento: Lancamento) => Promise<boolean>;

  detalheId: string | null;
  lancamentoDetalhe: Lancamento | null;
  onAbrirDetalhe: (id: string) => void;
  onFecharDetalhe: () => void;
  onSalvarDetalhe: (input: Partial<Lancamento>) => Promise<void>;
};

export function LancamentosTable({
  anoFiltroMeses,
  anosDisponiveis,
  mesFiltroSelecionado,
  onMudarAno,
  onMudarMes,
  lancamentos,
  lancamentosProcessados,
  nome,
  opcoesColunas,
  ordenacao,
  onOrdenar,
  filtros,
  onFiltrar,
  onLimparFiltro,
  paginaLancamentos,
  tamanhoPagina,
  onMudarPagina,
  pessoas,
  categorias,
  bancos,
  investimentos,
  parcelamentosPorId,
  onRemoverLancamento,
  detalheId,
  lancamentoDetalhe,
  onAbrirDetalhe,
  onFecharDetalhe,
  onSalvarDetalhe,
}: Props) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Select
          id="f-ano"
          className="w-28"
          value={String(anoFiltroMeses)}
          onChange={(v) => onMudarAno(Number(v))}
          options={anosDisponiveis.map((ano) => ({
            value: String(ano),
            label: String(ano),
          }))}
        />

        {NOMES_MESES.map((nomeMes, idx) => {
          const ativo = mesFiltroSelecionado === idx;
          return (
            <button
              key={nomeMes}
              type="button"
              onClick={() => onMudarMes(ativo ? null : idx)}
              className={
                ativo
                  ? "bg-primary px-md text-on-primary rounded-full py-1 text-xs font-semibold"
                  : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low px-md rounded-full border py-1 text-xs"
              }
            >
              {nomeMes}
            </button>
          );
        })}
      </div>

      <div className="border-outline-variant bg-surface-container-lowest overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-outline-variant text-on-surface-variant border-b text-xs font-semibold tracking-wide uppercase">
              <ColumnHeader
                label="Data"
                chave="data"
                tipo="data"
                ordenacao={ordenacao}
                onOrdenar={onOrdenar}
                filtro={filtros.data}
                onFiltrar={onFiltrar}
                onLimparFiltro={onLimparFiltro}
              />
              <ColumnHeader
                label="Descrição"
                chave="descricao"
                tipo="texto"
                ordenacao={ordenacao}
                onOrdenar={onOrdenar}
                filtro={filtros.descricao}
                onFiltrar={onFiltrar}
                onLimparFiltro={onLimparFiltro}
              />
              <ColumnHeader
                label="Valor"
                chave="valor"
                tipo="numero"
                align="right"
                ordenacao={ordenacao}
                onOrdenar={onOrdenar}
                filtro={filtros.valor}
                onFiltrar={onFiltrar}
                onLimparFiltro={onLimparFiltro}
              />
              <ColumnHeader
                label="Categoria"
                chave="categoria"
                tipo="opcoes"
                opcoes={opcoesColunas.categoria}
                ordenacao={ordenacao}
                onOrdenar={onOrdenar}
                filtro={filtros.categoria}
                onFiltrar={onFiltrar}
                onLimparFiltro={onLimparFiltro}
              />
              <ColumnHeader
                label="Subcategoria"
                chave="subcategoria"
                tipo="opcoes"
                opcoes={opcoesColunas.subcategoria}
                ordenacao={ordenacao}
                onOrdenar={onOrdenar}
                filtro={filtros.subcategoria}
                onFiltrar={onFiltrar}
                onLimparFiltro={onLimparFiltro}
              />
              <ColumnHeader
                label="Banco"
                chave="banco"
                tipo="opcoes"
                opcoes={opcoesColunas.banco}
                ordenacao={ordenacao}
                onOrdenar={onOrdenar}
                filtro={filtros.banco}
                onFiltrar={onFiltrar}
                onLimparFiltro={onLimparFiltro}
              />
              <ColumnHeader
                label="Divisão"
                chave="divisao"
                tipo="opcoes"
                opcoes={opcoesColunas.divisao}
                ordenacao={ordenacao}
                onOrdenar={onOrdenar}
                filtro={filtros.divisao}
                onFiltrar={onFiltrar}
                onLimparFiltro={onLimparFiltro}
              />
              <ColumnHeader
                label="Pagou"
                chave="pagou"
                tipo="opcoes"
                opcoes={opcoesColunas.pagou}
                ordenacao={ordenacao}
                onOrdenar={onOrdenar}
                filtro={filtros.pagou}
                onFiltrar={onFiltrar}
                onLimparFiltro={onLimparFiltro}
              />
              <ColumnHeader
                label="Tipo de gasto"
                chave="tipoGasto"
                tipo="opcoes"
                opcoes={opcoesColunas.tipoGasto}
                ordenacao={ordenacao}
                onOrdenar={onOrdenar}
                filtro={filtros.tipoGasto}
                onFiltrar={onFiltrar}
                onLimparFiltro={onLimparFiltro}
              />
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {lancamentosProcessados
              .slice(
                paginaLancamentos * tamanhoPagina,
                paginaLancamentos * tamanhoPagina + tamanhoPagina,
              )
              .map((lancamento) => (
                <LinhaLancamento
                  key={lancamento.id}
                  lancamento={lancamento}
                  pessoas={pessoas}
                  nome={nome}
                  quantidadeParcelasTotal={
                    lancamento.parcelamentoId
                      ? (parcelamentosPorId.get(lancamento.parcelamentoId) ??
                        null)
                      : null
                  }
                  onRemover={onRemoverLancamento}
                  onAbrirDetalhe={() => onAbrirDetalhe(lancamento.id)}
                  selecionada={detalheId === lancamento.id}
                />
              ))}
          </tbody>
        </table>
      </div>

      {lancamentos && lancamentosProcessados.length === 0 && (
        <p className="text-on-surface-variant text-sm">
          {lancamentos.length === 0
            ? "Nenhum lançamento encontrado."
            : "Nenhum lançamento corresponde aos filtros das colunas."}
        </p>
      )}

      {lancamentosProcessados.length > tamanhoPagina && (
        <div className="text-on-surface-variant flex items-center justify-between text-xs">
          <span>
            Mostrando{" "}
            {Math.min(
              tamanhoPagina,
              lancamentosProcessados.length - paginaLancamentos * tamanhoPagina,
            )}{" "}
            de {lancamentosProcessados.length} lançamentos
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={paginaLancamentos === 0}
              onClick={() => onMudarPagina(Math.max(0, paginaLancamentos - 1))}
              className="border-outline-variant px-sm rounded-full border py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={
                (paginaLancamentos + 1) * tamanhoPagina >=
                lancamentosProcessados.length
              }
              onClick={() => onMudarPagina(paginaLancamentos + 1)}
              className="border-outline-variant px-sm rounded-full border py-1 disabled:opacity-40"
            >
              Próximo
            </button>
          </div>
        </div>
      )}

      {lancamentoDetalhe && (
        <DetalheLancamentoDrawer
          key={lancamentoDetalhe.id}
          lancamento={lancamentoDetalhe}
          categorias={categorias}
          bancos={bancos}
          pessoas={pessoas}
          investimentos={investimentos}
          onFechar={onFecharDetalhe}
          onSalvar={onSalvarDetalhe}
        />
      )}
    </>
  );
}
