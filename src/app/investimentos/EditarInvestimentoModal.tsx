"use client";

import { useState } from "react";
import {
  TIPOS_INVESTIMENTO,
  parseErro,
  reaisParaCentavos,
  type Banco,
  type Pessoa,
  type Investimento,
  type TipoInvestimento,
} from "./InvestimentosClient";

const inputClass =
  "rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-1.5 text-sm focus:border-primary focus:outline-none";

type Props = {
  investimento: Investimento;
  bancos: Banco[];
  pessoas: Pessoa[];
  onClose: () => void;
  onEditado: () => void;
};

export function EditarInvestimentoModal({
  investimento,
  bancos,
  pessoas,
  onClose,
  onEditado,
}: Props) {
  const [bancoId, setBancoId] = useState(investimento.bancoId);
  const [pessoaId, setPessoaId] = useState(investimento.pessoaId);
  const [tipo, setTipo] = useState<TipoInvestimento>(investimento.tipo);
  const [produto, setProduto] = useState(investimento.produto);
  const [valor, setValor] = useState(
    (investimento.valorAtualCentavos / 100).toFixed(2),
  );
  const [modoLiquidez, setModoLiquidez] = useState<"DIAS" | "DATA" | "NENHUM">(
    investimento.liquidezDias !== null
      ? "DIAS"
      : investimento.vencimento
        ? "DATA"
        : "NENHUM",
  );
  const [liquidezDias, setLiquidezDias] = useState(
    (investimento.liquidezDias ?? 0).toString(),
  );
  const [vencimento, setVencimento] = useState(
    investimento.vencimento ? investimento.vencimento.slice(0, 10) : "",
  );
  const [observacao, setObservacao] = useState(investimento.observacao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    const response = await fetch(`/api/investimentos/${investimento.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bancoId,
        pessoaId,
        tipo,
        produto,
        valorAtualCentavos: reaisParaCentavos(valor || "0"),
        liquidezDias: modoLiquidez === "DIAS" ? Number(liquidezDias) : null,
        vencimento: modoLiquidez === "DATA" ? vencimento : null,
        observacao: observacao.trim() === "" ? null : observacao,
      }),
    });
    setEnviando(false);
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    onEditado();
  }

  return (
    <div className="bg-on-surface/40 p-lg fixed inset-0 z-[100] flex items-center justify-center">
      <div className="gap-md p-lg border-outline-variant bg-surface-container-lowest flex w-full max-w-[36rem] flex-col rounded-2xl border shadow-lg">
        <h2 className="text-on-surface text-base font-bold">
          Editar &quot;{investimento.produto}&quot;
        </h2>

        {erro && (
          <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
            {erro}
          </p>
        )}

        <form onSubmit={salvar} className="gap-md flex flex-col">
          <div className="gap-sm flex flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="editar-banco"
              >
                Banco
              </label>
              <select
                id="editar-banco"
                className={inputClass}
                value={bancoId}
                onChange={(e) => setBancoId(e.target.value)}
                required
              >
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="editar-titular"
              >
                Titular
              </label>
              <select
                id="editar-titular"
                className={inputClass}
                value={pessoaId}
                onChange={(e) => setPessoaId(e.target.value)}
                required
              >
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="editar-tipo"
              >
                Tipo
              </label>
              <select
                id="editar-tipo"
                className={inputClass}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoInvestimento)}
              >
                {TIPOS_INVESTIMENTO.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="gap-sm flex flex-wrap items-end">
            <div className="flex min-w-[160px] flex-1 flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="editar-produto"
              >
                Produto
              </label>
              <input
                id="editar-produto"
                className={inputClass}
                value={produto}
                onChange={(e) => setProduto(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="editar-valor"
              >
                Valor atual (R$)
              </label>
              <input
                id="editar-valor"
                type="number"
                step="0.01"
                className={`w-32 text-right ${inputClass}`}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="gap-sm flex flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="editar-modo-liquidez"
              >
                Vencimento/liquidez
              </label>
              <select
                id="editar-modo-liquidez"
                className={inputClass}
                value={modoLiquidez}
                onChange={(e) =>
                  setModoLiquidez(e.target.value as "DIAS" | "DATA" | "NENHUM")
                }
              >
                <option value="DIAS">Prazo (D+n)</option>
                <option value="DATA">Data de vencimento</option>
                <option value="NENHUM">Indefinido</option>
              </select>
            </div>

            {modoLiquidez === "DIAS" && (
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="editar-liquidez-dias"
                >
                  Dias (D+n)
                </label>
                <input
                  id="editar-liquidez-dias"
                  type="number"
                  min={0}
                  className={`w-24 ${inputClass}`}
                  value={liquidezDias}
                  onChange={(e) => setLiquidezDias(e.target.value)}
                />
              </div>
            )}

            {modoLiquidez === "DATA" && (
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="editar-vencimento"
                >
                  Data
                </label>
                <input
                  id="editar-vencimento"
                  type="date"
                  className={inputClass}
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="editar-observacao"
            >
              Observação (Opcional)
            </label>
            <input
              id="editar-observacao"
              className={inputClass}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border-outline-variant text-on-surface px-md rounded-full border py-1.5 text-xs font-semibold hover:bg-surface-container-low"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="bg-primary text-on-primary px-md rounded-full py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-60"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
