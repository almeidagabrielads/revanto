"use client";

import { useState } from "react";
import { Select } from "../components/Select";
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
        <h2 className="text-on-surface text-xl font-bold">
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
              <Select
                id="novo-banco"
                value={bancoId}
                onChange={setBancoId}
                options={bancos.map((b) => ({ value: b.id, label: b.nome }))}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="novo-titular"
              >
                Titular
              </label>
              <Select
                id="novo-titular"
                value={pessoaId}
                onChange={setPessoaId}
                options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="novo-tipo"
              >
                Tipo
              </label>
              <Select
                id="novo-tipo"
                value={tipo}
                onChange={(v) => setTipo(v as TipoInvestimento)}
                options={TIPOS_INVESTIMENTO.map((t) => ({
                  value: t.value,
                  label: t.label,
                }))}
              />
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
              <Select
                id="novo-modo-liquidez"
                value={modoLiquidez}
                onChange={(v) =>
                  setModoLiquidez(v as "DIAS" | "DATA" | "NENHUM")
                }
                options={[
                  { value: "DIAS", label: "Prazo (D+n)" },
                  { value: "DATA", label: "Data de vencimento" },
                  { value: "NENHUM", label: "Indefinido" },
                ]}
              />
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
              className="border-outline-variant text-on-surface px-md hover:bg-surface-container-low rounded-full border py-1.5 text-xs font-semibold"
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
