"use client";

import { useState } from "react";
import { Select } from "../../components/Select";
import { centavosParaReais, reaisParaCentavos } from "@/lib/domain/formatacao";
import {
  SEM_CATEGORIA,
  TIPOS_GASTO,
  dataParaInputDate,
  type Banco,
  type Categoria,
  type Investimento,
  type Lancamento,
  type Pessoa,
} from "./types";

type Props = {
  lancamento: Lancamento;
  categorias: Categoria[];
  bancos: Banco[];
  pessoas: Pessoa[];
  investimentos: Investimento[];
  onFechar: () => void;
  onSalvar: (input: Partial<Lancamento>) => Promise<void>;
};

export function DetalheLancamentoDrawer({
  lancamento,
  categorias,
  bancos,
  pessoas,
  investimentos,
  onFechar,
  onSalvar,
}: Props) {
  const [data, setData] = useState(dataParaInputDate(lancamento.data));
  const [descricao, setDescricao] = useState(lancamento.descricaoPropria ?? "");
  const [valor, setValor] = useState(
    centavosParaReais(lancamento.valorCentavos),
  );
  const [categoriaId, setCategoriaId] = useState(
    lancamento.categoriaId ?? SEM_CATEGORIA,
  );
  const [subcategoriaId, setSubcategoriaId] = useState(
    lancamento.subcategoriaId ?? SEM_CATEGORIA,
  );
  const [bancoId, setBancoId] = useState(lancamento.bancoId);
  const [pessoaDivisaoId, setPessoaDivisaoId] = useState(
    lancamento.pessoaDivisaoId,
  );
  const [pessoaPagouId, setPessoaPagouId] = useState(lancamento.pessoaPagouId);
  const [pagoComResgateInvestimento, setPagoComResgateInvestimento] = useState(
    lancamento.pagoComResgateInvestimento ?? false,
  );
  const [investimentoResgateId, setInvestimentoResgateId] = useState(
    lancamento.investimentoResgateId ?? "",
  );
  const [tipoGasto, setTipoGasto] = useState(lancamento.tipoGasto);
  const [salvando, setSalvando] = useState(false);

  const subcategoriasDaCategoria =
    categorias.find((c) => c.id === categoriaId)?.subcategorias ?? [];

  async function salvar() {
    setSalvando(true);
    try {
      await onSalvar({
        data,
        descricaoPropria: descricao || null,
        valorCentavos: reaisParaCentavos(valor),
        categoriaId: categoriaId || null,
        subcategoriaId: subcategoriaId || null,
        bancoId,
        pessoaDivisaoId,
        pessoaPagouId,
        pagoComResgateInvestimento,
        investimentoResgateId: pagoComResgateInvestimento
          ? investimentoResgateId || null
          : null,
        tipoGasto,
      });
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  const inputClass =
    "rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-sm";
  const labelClass =
    "text-on-surface-variant text-xs font-semibold tracking-wide uppercase";

  return (
    <div
      className="bg-on-surface/40 fixed inset-0 z-[100] flex justify-end"
      onClick={onFechar}
    >
      <div
        className="gap-md border-outline-variant bg-surface-container-lowest p-lg flex h-full w-full max-w-[28rem] flex-col overflow-y-auto border-l shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-on-surface text-lg font-bold">
            Detalhes do lançamento
          </h2>
          <button
            type="button"
            onClick={onFechar}
            title="Fechar"
            aria-label="Fechar"
            className="text-on-surface-variant hover:bg-surface-container rounded-full p-1.5"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="gap-sm grid grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-data">
              Data
            </label>
            <input
              id="dt-data"
              type="date"
              className={inputClass}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-valor">
              Valor
            </label>
            <input
              id="dt-valor"
              type="number"
              step="0.01"
              className={`text-right ${inputClass}`}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="dt-descricao">
            Descrição
          </label>
          <textarea
            id="dt-descricao"
            className={`${inputClass} resize-none`}
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={lancamento.descricaoOrigem ?? ""}
          />
        </div>

        <div className="gap-sm grid grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-categoria">
              Categoria
            </label>
            <Select
              id="dt-categoria"
              value={categoriaId}
              onChange={(v) => {
                setCategoriaId(v);
                setSubcategoriaId(SEM_CATEGORIA);
              }}
              options={[
                { value: SEM_CATEGORIA, label: "Nenhuma" },
                ...categorias.map((c) => ({ value: c.id, label: c.nome })),
              ]}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-subcategoria">
              Subcategoria
            </label>
            <Select
              id="dt-subcategoria"
              value={subcategoriaId}
              onChange={setSubcategoriaId}
              disabled={!categoriaId}
              options={[
                { value: SEM_CATEGORIA, label: "Nenhuma" },
                ...subcategoriasDaCategoria.map((s) => ({
                  value: s.id,
                  label: s.nome,
                })),
              ]}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="dt-banco">
            Conta
          </label>
          <Select
            id="dt-banco"
            value={bancoId}
            onChange={setBancoId}
            options={bancos.map((b) => ({ value: b.id, label: b.nome }))}
          />
        </div>

        <div className="gap-sm grid grid-cols-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-divisao">
              Divisão
            </label>
            <Select
              id="dt-divisao"
              value={pessoaDivisaoId}
              onChange={setPessoaDivisaoId}
              options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-pagou">
              Responsável
            </label>
            <Select
              id="dt-pagou"
              value={pessoaPagouId}
              onChange={setPessoaPagouId}
              options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-tipo-gasto">
              Tipo de gasto
            </label>
            <Select
              id="dt-tipo-gasto"
              value={tipoGasto}
              onChange={setTipoGasto}
              options={TIPOS_GASTO.map((t) => ({
                value: t.value,
                label: t.label,
              }))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-on-surface-variant flex items-center gap-1.5 text-xs font-semibold">
            <input
              type="checkbox"
              checked={pagoComResgateInvestimento}
              onChange={(e) => {
                setPagoComResgateInvestimento(e.target.checked);
                if (!e.target.checked) setInvestimentoResgateId("");
              }}
            />
            Pago com resgate de investimento
          </label>
        </div>
        {pagoComResgateInvestimento && (
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-investimento">
              Investimento (opcional)
            </label>
            <Select
              id="dt-investimento"
              value={investimentoResgateId}
              onChange={setInvestimentoResgateId}
              options={[
                { value: "", label: "Não informado" },
                ...investimentos.map((i) => ({
                  value: i.id,
                  label: i.produto,
                })),
              ]}
            />
          </div>
        )}

        <div className="border-outline-variant pt-md mt-auto border-t">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="bg-primary px-md text-on-primary w-full rounded-full py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
