"use client";

import { useState } from "react";
import {
  TIPOS_INVESTIMENTO,
  parseErro,
  reaisParaCentavos,
  type Banco,
  type Pessoa,
  type TipoInvestimento,
} from "./InvestimentosClient";

const inputClass =
  "rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-1.5 text-sm focus:border-primary focus:outline-none";

type Props = {
  bancos: Banco[];
  pessoas: Pessoa[];
  onClose: () => void;
  onCriado: () => void;
};

export function NovoInvestimentoModal({
  bancos,
  pessoas,
  onClose,
  onCriado,
}: Props) {
  const [bancoId, setBancoId] = useState(bancos[0]?.id ?? "");
  const [pessoaId, setPessoaId] = useState(pessoas[0]?.id ?? "");
  const [tipo, setTipo] = useState<TipoInvestimento>("RENDA_FIXA");
  const [produto, setProduto] = useState("");
  const [valor, setValor] = useState("");
  const [modoLiquidez, setModoLiquidez] = useState<"DIAS" | "DATA" | "NENHUM">(
    "DIAS",
  );
  const [liquidezDias, setLiquidezDias] = useState("0");
  const [vencimento, setVencimento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    const response = await fetch("/api/investimentos", {
      method: "POST",
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
    onCriado();
  }

  return (
    <div className="bg-on-surface/40 p-lg fixed inset-0 z-[100] flex items-center justify-center">
      <div className="gap-md p-lg border-outline-variant bg-surface-container-lowest flex w-full max-w-[36rem] flex-col rounded-2xl border shadow-lg">
        <h2 className="text-on-surface text-base font-bold">
          Registrar Novo Investimento
        </h2>

        {erro && (
          <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
            {erro}
          </p>
        )}

        <form onSubmit={criar} className="gap-md flex flex-col">
          <div className="gap-sm flex flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="novo-banco"
              >
                Banco
              </label>
              <select
                id="novo-banco"
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
                htmlFor="novo-titular"
              >
                Titular
              </label>
              <select
                id="novo-titular"
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
                htmlFor="novo-tipo"
              >
                Tipo
              </label>
              <select
                id="novo-tipo"
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
                htmlFor="novo-produto"
              >
                Produto
              </label>
              <input
                id="novo-produto"
                className={inputClass}
                value={produto}
                onChange={(e) => setProduto(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="novo-valor"
              >
                Valor atual (R$)
              </label>
              <input
                id="novo-valor"
                type="number"
                step="0.01"
                placeholder="0,00"
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
                htmlFor="novo-modo-liquidez"
              >
                Vencimento/liquidez
              </label>
              <select
                id="novo-modo-liquidez"
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
                  htmlFor="novo-liquidez-dias"
                >
                  Dias (D+n)
                </label>
                <input
                  id="novo-liquidez-dias"
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
                  htmlFor="novo-vencimento"
                >
                  Data
                </label>
                <input
                  id="novo-vencimento"
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
              htmlFor="novo-observacao"
            >
              Observação (Opcional)
            </label>
            <input
              id="novo-observacao"
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
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
