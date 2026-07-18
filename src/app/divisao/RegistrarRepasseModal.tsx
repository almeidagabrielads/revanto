"use client";

import { useState } from "react";
import { Select } from "../components/Select";
import { parseErro, reaisParaCentavos, type Pessoa } from "./DivisaoClient";

const inputClass =
  "rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-1.5 text-sm focus:border-primary focus:outline-none";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  pessoas: Pessoa[];
  onClose: () => void;
  onRegistrado: () => void;
};

export function RegistrarRepasseModal({ pessoas, onClose, onRegistrado }: Props) {
  const [origemId, setOrigemId] = useState(pessoas[0]?.id ?? "");
  const [destinoId, setDestinoId] = useState(pessoas[1]?.id ?? "");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!origemId || !destinoId) {
      setErro("Selecione a origem e o destino do repasse.");
      return;
    }
    if (origemId === destinoId) {
      setErro("Origem e destino devem ser pessoas diferentes.");
      return;
    }

    setEnviando(true);
    const response = await fetch("/api/acertos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deId: origemId,
        paraId: destinoId,
        valorCentavos: reaisParaCentavos(valor || "0"),
        data,
      }),
    });
    setEnviando(false);
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    onRegistrado();
  }

  return (
    <div className="bg-on-surface/40 p-lg fixed inset-0 z-[100] flex items-center justify-center">
      <div className="gap-md p-lg border-outline-variant bg-surface-container-lowest flex w-full max-w-[32rem] flex-col rounded-2xl border shadow-lg">
        <h2 className="text-on-surface text-base font-bold">
          Registrar repasse
        </h2>
        <p className="text-on-surface-variant text-sm">
          Registre um Pix ou transferência já feito entre duas pessoas. Ele
          não vira um lançamento, mas abate ou soma no saldo do acerto de
          contas.
        </p>

        {erro && (
          <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
            {erro}
          </p>
        )}

        <form onSubmit={registrar} className="gap-md flex flex-col">
          <div className="gap-sm flex flex-wrap items-end">
            <div className="flex min-w-[140px] flex-1 flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="repasse-origem"
              >
                Origem
              </label>
              <Select
                id="repasse-origem"
                value={origemId}
                onChange={setOrigemId}
                options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
              />
            </div>

            <div className="flex min-w-[140px] flex-1 flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="repasse-destino"
              >
                Destino
              </label>
              <Select
                id="repasse-destino"
                value={destinoId}
                onChange={setDestinoId}
                options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
              />
            </div>
          </div>

          <div className="gap-sm flex flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="repasse-valor"
              >
                Valor (R$)
              </label>
              <input
                id="repasse-valor"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                className={`w-32 text-right ${inputClass}`}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="repasse-data"
              >
                Data
              </label>
              <input
                id="repasse-data"
                type="date"
                className={inputClass}
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </div>
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
              disabled={enviando || pessoas.length < 2}
              className="bg-primary text-on-primary px-md rounded-full py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {enviando ? "Registrando…" : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
