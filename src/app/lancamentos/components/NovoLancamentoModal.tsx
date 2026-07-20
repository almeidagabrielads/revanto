"use client";

import type React from "react";
import { Select } from "../../components/Select";
import {
  DescricaoAutocomplete,
  type SugestaoDescricao,
} from "../../components/DescricaoAutocomplete";
import {
  MODOS_PARCELAMENTO,
  SEM_CATEGORIA,
  TIPOS_GASTO,
  inputClass,
  type Banco,
  type Categoria,
  type FormLancamento,
  type Investimento,
  type Pessoa,
  type Subcategoria,
} from "./types";

type Props = {
  form: FormLancamento;
  onChangeForm: (form: FormLancamento) => void;
  categorias: Categoria[];
  subcategoriasDaCategoriaSelecionada: Subcategoria[];
  bancos: Banco[];
  pessoas: Pessoa[];
  investimentos: Investimento[];
  erro: string | null;
  onFechar: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSelecionarSugestaoDescricao: (sugestao: SugestaoDescricao) => void;
};

export function NovoLancamentoModal({
  form,
  onChangeForm,
  categorias,
  subcategoriasDaCategoriaSelecionada,
  bancos,
  pessoas,
  investimentos,
  erro,
  onFechar,
  onSubmit,
  onSelecionarSugestaoDescricao,
}: Props) {
  return (
    <div
      className="bg-on-surface/40 p-lg fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onFechar}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="gap-sm border-outline-variant bg-surface-container-lowest p-lg flex max-h-[85vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-on-surface flex items-center gap-1.5 text-lg font-bold">
            Novo Lançamento
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

        {erro && (
          <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
            {erro}
          </p>
        )}

        <div className="gap-sm grid grid-cols-2 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="l-data"
            >
              Data <span className="text-danger">*</span>
            </label>
            <input
              id="l-data"
              type="date"
              className={inputClass}
              value={form.data}
              onChange={(e) => onChangeForm({ ...form, data: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="l-categoria"
            >
              Categoria
            </label>
            <Select
              id="l-categoria"
              value={form.categoriaId}
              onChange={(v) =>
                onChangeForm({
                  ...form,
                  categoriaId: v,
                  subcategoriaId: SEM_CATEGORIA,
                })
              }
              options={[
                { value: SEM_CATEGORIA, label: "Nenhuma" },
                ...categorias.map((c) => ({ value: c.id, label: c.nome })),
              ]}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="l-subcategoria"
            >
              Subcategoria
            </label>
            <Select
              id="l-subcategoria"
              value={form.subcategoriaId}
              onChange={(v) => onChangeForm({ ...form, subcategoriaId: v })}
              disabled={!form.categoriaId}
              options={[
                { value: SEM_CATEGORIA, label: "Nenhuma" },
                ...subcategoriasDaCategoriaSelecionada.map((s) => ({
                  value: s.id,
                  label: s.nome,
                })),
              ]}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="l-banco"
            >
              Banco / Cartão <span className="text-danger">*</span>
            </label>
            <Select
              id="l-banco"
              value={form.bancoId}
              onChange={(v) => onChangeForm({ ...form, bancoId: v })}
              options={bancos.map((b) => ({ value: b.id, label: b.nome }))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            className="text-on-surface-variant text-xs font-semibold"
            htmlFor="l-descricao"
          >
            Descrição
          </label>
          <DescricaoAutocomplete
            id="l-descricao"
            className={inputClass}
            placeholder="Ex: Supermercado"
            value={form.descricaoPropria}
            onChange={(v) => onChangeForm({ ...form, descricaoPropria: v })}
            onSelecionar={onSelecionarSugestaoDescricao}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-on-surface-variant text-xs font-semibold">
            Quem Pagou? <span className="text-danger">*</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {pessoas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChangeForm({ ...form, pessoaPagouId: p.id })}
                className={
                  form.pessoaPagouId === p.id
                    ? "bg-primary px-md text-on-primary rounded-lg py-1.5 text-sm font-semibold"
                    : "border-outline-variant bg-surface-container-lowest px-md text-on-surface hover:bg-surface-container-low rounded-lg border py-1.5 text-sm"
                }
              >
                {p.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="gap-sm grid grid-cols-1 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="l-divisao"
            >
              Divisão <span className="text-danger">*</span>
            </label>
            <Select
              id="l-divisao"
              value={form.pessoaDivisaoId}
              onChange={(v) => onChangeForm({ ...form, pessoaDivisaoId: v })}
              options={pessoas.map((p) => ({
                value: p.id,
                label: `${p.nome}${p.tipo === "CASAL" ? " (50/50)" : ""}`,
              }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="l-tipo-gasto"
            >
              Tipo de gasto
            </label>
            <Select
              id="l-tipo-gasto"
              value={form.tipoGasto}
              onChange={(v) => onChangeForm({ ...form, tipoGasto: v })}
              options={TIPOS_GASTO.map((t) => ({
                value: t.value,
                label: t.label,
              }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="l-valor"
            >
              Valor (R$) <span className="text-danger">*</span>
            </label>
            <input
              id="l-valor"
              type="number"
              step="0.01"
              title="Use valor negativo para estornos"
              className={inputClass}
              value={form.valor}
              onChange={(e) => onChangeForm({ ...form, valor: e.target.value })}
              placeholder="0,00"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="l-desconto"
            >
              Desconto / Estorno
            </label>
            <input
              id="l-desconto"
              type="number"
              step="0.01"
              min={0}
              className={inputClass}
              value={form.desconto}
              onChange={(e) =>
                onChangeForm({ ...form, desconto: e.target.value })
              }
              placeholder="0,00"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-on-surface flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.parcelar}
              onChange={(e) =>
                onChangeForm({ ...form, parcelar: e.target.checked })
              }
            />
            Parcelar?
          </label>
          {form.parcelar && (
            <div className="bg-surface-container-low gap-sm p-sm flex flex-col rounded-lg">
              <p className="text-on-surface-variant text-xs">
                O valor informado acima é o valor de <strong>uma</strong>{" "}
                parcela.
              </p>
              <div className="gap-sm grid grid-cols-1 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label
                    className="text-on-surface-variant text-xs font-semibold"
                    htmlFor="l-qtd-parcelas"
                  >
                    Quantidade de parcelas{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <input
                    id="l-qtd-parcelas"
                    type="number"
                    min={2}
                    step={1}
                    className={inputClass}
                    value={form.quantidadeParcelas}
                    onChange={(e) =>
                      onChangeForm({
                        ...form,
                        quantidadeParcelas: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    className="text-on-surface-variant text-xs font-semibold"
                    htmlFor="l-modo-parcelamento"
                  >
                    Modo de parcelamento
                  </label>
                  <Select
                    id="l-modo-parcelamento"
                    value={form.modoParcelamento}
                    onChange={(v) =>
                      onChangeForm({ ...form, modoParcelamento: v })
                    }
                    options={MODOS_PARCELAMENTO.map((m) => ({
                      value: m.value,
                      label: m.label,
                    }))}
                  />
                </div>
              </div>
              <ul className="text-on-surface-variant flex flex-col gap-0.5 text-xs">
                {MODOS_PARCELAMENTO.map((m) => (
                  <li key={m.value}>
                    <strong>{m.label}:</strong> {m.descricao}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-on-surface flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.pagoComResgateInvestimento}
              onChange={(e) =>
                onChangeForm({
                  ...form,
                  pagoComResgateInvestimento: e.target.checked,
                  investimentoResgateId: e.target.checked
                    ? form.investimentoResgateId
                    : "",
                })
              }
            />
            Pago com resgate de investimento
          </label>
          {form.pagoComResgateInvestimento && (
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="l-investimento"
              >
                Investimento (opcional)
              </label>
              <Select
                id="l-investimento"
                value={form.investimentoResgateId}
                onChange={(v) =>
                  onChangeForm({ ...form, investimentoResgateId: v })
                }
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
        </div>

        <div className="border-outline-variant mt-1 flex items-center justify-end gap-2 border-t pt-3">
          <button
            type="button"
            onClick={onFechar}
            className="border-outline-variant bg-surface-container-lowest px-lg text-on-surface hover:bg-surface-container-low rounded-full border py-2 text-sm font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="bg-primary px-lg text-on-primary rounded-full py-2 text-sm font-semibold hover:opacity-90"
          >
            Salvar Lançamento
          </button>
        </div>
      </form>
    </div>
  );
}
