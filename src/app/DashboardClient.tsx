"use client";

import { useState } from "react";
import { DashboardMensal } from "./DashboardMensal";
import { DashboardAnual } from "./DashboardAnual";

const NOMES_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type Modo = "mensal" | "anual";

export function DashboardClient() {
  const hoje = new Date();
  const [modo, setModo] = useState<Modo>("mensal");
  const [ano, setAno] = useState(hoje.getUTCFullYear());
  const [mes, setMes] = useState(hoje.getUTCMonth() + 1);

  function irParaMesAnterior() {
    if (mes === 1) {
      setMes(12);
      setAno((a) => a - 1);
    } else {
      setMes((m) => m - 1);
    }
  }

  function irParaProximoMes() {
    if (mes === 12) {
      setMes(1);
      setAno((a) => a + 1);
    } else {
      setMes((m) => m + 1);
    }
  }

  const botaoToggleClass = (ativo: boolean) =>
    `rounded-full px-md py-1.5 text-sm font-semibold transition-colors ${
      ativo
        ? "bg-primary text-on-primary"
        : "text-on-surface-variant hover:text-on-surface"
    }`;

  const botaoSetaClass =
    "flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary";

  return (
    <div className="gap-lg flex flex-col">
      <div className="gap-md flex flex-wrap items-center justify-between">
        <div className="gap-md flex items-center">
          <h1 className="text-on-surface text-3xl font-bold">
            {modo === "mensal"
              ? `${NOMES_MES[mes - 1]} ${ano}`
              : `Ano de ${ano}`}
          </h1>
          {modo === "mensal" ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={irParaMesAnterior}
                aria-label="Mês anterior"
                className={botaoSetaClass}
              >
                ‹
              </button>
              <button
                onClick={irParaProximoMes}
                aria-label="Próximo mês"
                className={botaoSetaClass}
              >
                ›
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAno((a) => a - 1)}
                aria-label="Ano anterior"
                className={botaoSetaClass}
              >
                ‹
              </button>
              <button
                onClick={() => setAno((a) => a + 1)}
                aria-label="Próximo ano"
                className={botaoSetaClass}
              >
                ›
              </button>
            </div>
          )}
        </div>

        <div className="border-outline-variant bg-surface-container-lowest flex items-center gap-1 rounded-full border p-1">
          <button
            onClick={() => setModo("mensal")}
            className={botaoToggleClass(modo === "mensal")}
          >
            Mensal
          </button>
          <button
            onClick={() => setModo("anual")}
            className={botaoToggleClass(modo === "anual")}
          >
            Anual
          </button>
        </div>
      </div>

      {modo === "mensal" ? (
        <DashboardMensal ano={ano} mes={mes} />
      ) : (
        <DashboardAnual ano={ano} />
      )}
    </div>
  );
}
