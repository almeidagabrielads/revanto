"use client";

import { useState } from "react";
import {
  TIPOS_INVESTIMENTO,
  parseErro,
  reaisParaCentavos,
  formatarReais,
  type Banco,
  type Investimento,
  type TipoInvestimento,
} from "./InvestimentosClient";

const inputClass =
  "rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-1.5 text-sm focus:border-primary focus:outline-none";

type Props = {
  investimento: Investimento;
  bancos: Banco[];
  onClose: () => void;
  onFinalizado: () => void;
};

export function FinalizarInvestimentoModal({
  investimento,
  bancos,
  onClose,
  onFinalizado,
}: Props) {
  const [valorResgatado, setValorResgatado] = useState(
    (investimento.valorAtualCentavos / 100).toFixed(2),
  );
  const [reinvestir, setReinvestir] = useState(false);
  const [valorReinvestido, setValorReinvestido] = useState("");
  const [criarReceita, setCriarReceita] = useState(true);
  const [novoBancoId, setNovoBancoId] = useState(bancos[0]?.id ?? "");
  const [novoTipo, setNovoTipo] = useState<TipoInvestimento>("RENDA_FIXA");
  const [novoProduto, setNovoProduto] = useState("");
  const [modoLiquidez, setModoLiquidez] = useState<"DIAS" | "DATA" | "NENHUM">(
    "DIAS",
  );
  const [liquidezDias, setLiquidezDias] = useState("0");
  const [vencimento, setVencimento] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const valorResgatadoCentavos = reaisParaCentavos(valorResgatado || "0");
  const valorReinvestidoCentavos = reinvestir
    ? reaisParaCentavos(valorReinvestido || "0")
    : 0;
  const valorLiquidoCentavos =
    valorResgatadoCentavos - valorReinvestidoCentavos;

  async function finalizar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (valorReinvestidoCentavos > valorResgatadoCentavos) {
      setErro("Valor reinvestido não pode ser maior que o valor resgatado.");
      return;
    }
    if (reinvestir && novoProduto.trim() === "") {
      setErro("Informe o produto do novo investimento.");
      return;
    }

    setEnviando(true);
    const response = await fetch(
      `/api/investimentos/${investimento.id}/finalizar`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valorResgatadoCentavos,
          valorReinvestidoCentavos,
          criarReceita,
          novoInvestimento: reinvestir
            ? {
                bancoId: novoBancoId,
                tipo: novoTipo,
                produto: novoProduto,
                liquidezDias:
                  modoLiquidez === "DIAS" ? Number(liquidezDias) : null,
                vencimento: modoLiquidez === "DATA" ? vencimento : null,
              }
            : undefined,
        }),
      },
    );
    setEnviando(false);
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    onFinalizado();
  }

  return (
    <div className="bg-on-surface/40 p-lg fixed inset-0 z-[100] flex items-center justify-center">
      <div className="gap-md p-lg border-outline-variant bg-surface-container-lowest flex w-full max-w-[32rem] flex-col rounded-2xl border shadow-lg">
        <h2 className="text-on-surface text-base font-bold">
          Finalizar &quot;{investimento.produto}&quot;
        </h2>

        {erro && (
          <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
            {erro}
          </p>
        )}

        <form onSubmit={finalizar} className="gap-md flex flex-col">
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="valor-resgatado"
            >
              Valor resgatado (R$)
            </label>
            <input
              id="valor-resgatado"
              type="number"
              step="0.01"
              className={inputClass}
              value={valorResgatado}
              onChange={(e) => setValorResgatado(e.target.value)}
              required
            />
          </div>

          <label className="gap-1.5 text-on-surface flex cursor-pointer items-center text-sm">
            <input
              type="checkbox"
              checked={reinvestir}
              onChange={(e) => setReinvestir(e.target.checked)}
            />
            Reinvestir parte do valor
          </label>

          {reinvestir && (
            <div className="gap-sm border-outline-variant p-md flex flex-col rounded-lg border">
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="valor-reinvestido"
                >
                  Valor reinvestido (R$)
                </label>
                <input
                  id="valor-reinvestido"
                  type="number"
                  step="0.01"
                  className={inputClass}
                  value={valorReinvestido}
                  onChange={(e) => setValorReinvestido(e.target.value)}
                  required
                />
              </div>

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
                    value={novoBancoId}
                    onChange={(e) => setNovoBancoId(e.target.value)}
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
                    htmlFor="novo-tipo"
                  >
                    Tipo
                  </label>
                  <select
                    id="novo-tipo"
                    className={inputClass}
                    value={novoTipo}
                    onChange={(e) =>
                      setNovoTipo(e.target.value as TipoInvestimento)
                    }
                  >
                    {TIPOS_INVESTIMENTO.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                  <label
                    className="text-on-surface-variant text-xs font-semibold"
                    htmlFor="novo-produto"
                  >
                    Produto
                  </label>
                  <input
                    id="novo-produto"
                    className={inputClass}
                    value={novoProduto}
                    onChange={(e) => setNovoProduto(e.target.value)}
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
                      setModoLiquidez(
                        e.target.value as "DIAS" | "DATA" | "NENHUM",
                      )
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
            </div>
          )}

          <label className="gap-1.5 text-on-surface flex cursor-pointer items-center text-sm">
            <input
              type="checkbox"
              checked={criarReceita}
              onChange={(e) => setCriarReceita(e.target.checked)}
            />
            Criar receita automaticamente com o valor resgatado
          </label>

          <p className="text-on-surface-variant text-xs">
            Valor líquido que entra como receita:{" "}
            <span className="text-on-surface font-semibold">
              {formatarReais(Math.max(valorLiquidoCentavos, 0))}
            </span>
          </p>

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
              Finalizar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
