"use client";

import { useEffect, useState } from "react";
import { Select } from "../components/Select";
import { useConfirmDialog } from "../components/ConfirmDialog";

type LancamentoParcela = {
  id: string;
  numeroParcela: number | null;
  previsto: boolean;
};

type Parcelamento = {
  id: string;
  descricaoOrigem: string | null;
  descricaoPropria: string | null;
  valorTotalCentavos: number;
  quantidadeParcelas: number;
  dataPrimeiraParcela: string;
  modo: "GRADUAL" | "AVISTA" | "PREVISAO";
  quitadoEm: string | null;
  lancamentos: LancamentoParcela[];
};

const MODOS_PARCELAMENTO = [
  { value: "GRADUAL", label: "Gradual" },
  { value: "AVISTA", label: "À vista" },
  { value: "PREVISAO", label: "Previsão" },
] as const;

function labelModo(modo: string): string {
  return MODOS_PARCELAMENTO.find((m) => m.value === modo)?.label ?? modo;
}

function formatarMoeda(valorCentavos: number): string {
  return (valorCentavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível completar a operação.";
}

function parcelasLancadas(p: Parcelamento): number {
  if (p.modo === "AVISTA") return p.quantidadeParcelas;
  return new Set(
    p.lancamentos
      .map((l) => l.numeroParcela)
      .filter((n): n is number => n !== null),
  ).size;
}

export function ParcelamentosPanel({
  onAlterado,
  refreshSignal,
}: {
  onAlterado?: () => void;
  refreshSignal?: number;
}) {
  const [parcelamentos, setParcelamentos] = useState<Parcelamento[] | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [modoEmEdicaoId, setModoEmEdicaoId] = useState<string | null>(null);
  const [novoModoSelecionado, setNovoModoSelecionado] = useState("GRADUAL");
  const [quitacaoEmEdicaoId, setQuitacaoEmEdicaoId] = useState<string | null>(
    null,
  );
  const [descontoQuitacao, setDescontoQuitacao] = useState("");
  const [dataQuitacao, setDataQuitacao] = useState("");
  const [processando, setProcessando] = useState<string | null>(null);
  const { confirmar, dialog: dialogConfirmacao } = useConfirmDialog();

  function recarregar() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    let cancelado = false;
    fetch("/api/parcelamentos")
      .then(async (response) => {
        if (cancelado) return;
        if (!response.ok) {
          setErro(await parseErro(response));
          return;
        }
        setErro(null);
        setParcelamentos(await response.json());
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar parcelamentos.");
      });
    return () => {
      cancelado = true;
    };
  }, [reloadToken, refreshSignal]);

  function abrirEdicaoModo(p: Parcelamento) {
    setModoEmEdicaoId(p.id);
    setNovoModoSelecionado(p.modo);
    setQuitacaoEmEdicaoId(null);
  }

  async function confirmarMudancaModo(p: Parcelamento) {
    if (novoModoSelecionado === p.modo) {
      setModoEmEdicaoId(null);
      return;
    }
    const vaiApagarParcelasFuturas =
      p.modo === "PREVISAO" && novoModoSelecionado === "GRADUAL";
    const vaiConsolidarTudoEmAvista = novoModoSelecionado === "AVISTA";
    if (vaiConsolidarTudoEmAvista) {
      const confirmado = await confirmar(
        "Isso vai apagar todas as parcelas (inclusive as já lançadas) e criar um único lançamento com o valor total.",
        { confirmLabel: "Confirmar" },
      );
      if (!confirmado) return;
    } else if (vaiApagarParcelasFuturas) {
      const confirmado = await confirmar(
        "Isso vai apagar as parcelas futuras ainda não realizadas.",
        { confirmLabel: "Confirmar" },
      );
      if (!confirmado) return;
    }
    setErro(null);
    setProcessando(p.id);
    try {
      const response = await fetch(`/api/parcelamentos/${p.id}/modo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novoModo: novoModoSelecionado }),
      });
      if (!response.ok) {
        setErro(await parseErro(response));
        return;
      }
      setModoEmEdicaoId(null);
      recarregar();
      onAlterado?.();
    } finally {
      setProcessando(null);
    }
  }

  function abrirQuitacao(p: Parcelamento) {
    setQuitacaoEmEdicaoId(p.id);
    setDescontoQuitacao("");
    setDataQuitacao("");
    setModoEmEdicaoId(null);
  }

  async function confirmarQuitacao(p: Parcelamento) {
    setErro(null);
    setProcessando(p.id);
    try {
      const descontoCentavos =
        descontoQuitacao.trim() === ""
          ? 0
          : Math.round(Number(descontoQuitacao.replace(",", ".")) * 100);
      const response = await fetch(`/api/parcelamentos/${p.id}/quitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataQuitacao: dataQuitacao || undefined,
          descontoCentavos,
        }),
      });
      if (!response.ok) {
        setErro(await parseErro(response));
        return;
      }
      setQuitacaoEmEdicaoId(null);
      recarregar();
      onAlterado?.();
    } finally {
      setProcessando(null);
    }
  }

  async function lancarProximaParcela(p: Parcelamento) {
    setErro(null);
    setProcessando(p.id);
    try {
      const response = await fetch(
        `/api/parcelamentos/${p.id}/proxima-parcela`,
        { method: "POST" },
      );
      if (!response.ok) {
        setErro(await parseErro(response));
        return;
      }
      recarregar();
      onAlterado?.();
    } finally {
      setProcessando(null);
    }
  }

  const inputClass =
    "rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-1.5 text-sm focus:border-primary focus:outline-none";
  const total = parcelamentos?.length ?? 0;

  return (
    <>
      {dialogConfirmacao}
      <button
        type="button"
        onClick={() => setDrawerAberto(true)}
        className="border-outline-variant bg-surface-container-lowest px-lg text-on-surface hover:bg-surface-container-low flex items-center gap-1.5 rounded-full border py-2 text-sm font-semibold"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
        Parcelamentos
        {total > 0 && (
          <span className="bg-primary text-on-primary flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold">
            {total}
          </span>
        )}
      </button>

      {drawerAberto && (
        <div
          className="bg-on-surface/40 fixed inset-0 z-[100] flex justify-end"
          onClick={() => setDrawerAberto(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-container-lowest p-lg gap-sm flex h-full w-full max-w-[28rem] flex-col overflow-y-auto shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-on-surface text-2xl font-bold">
                Parcelamentos em aberto
              </h2>
              <button
                type="button"
                onClick={() => setDrawerAberto(false)}
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
                  aria-hidden
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

            {parcelamentos === null ? (
              <p className="text-on-surface-variant text-sm">Carregando…</p>
            ) : parcelamentos.length === 0 ? (
              <p className="text-on-surface-variant text-sm">
                Nenhum parcelamento em aberto.
              </p>
            ) : (
              <div className="gap-sm flex flex-col">
                {parcelamentos.map((p) => {
                  const lancadas = parcelasLancadas(p);
                  const descricao =
                    p.descricaoPropria || p.descricaoOrigem || "Parcelamento";
                  return (
                    <div
                      key={p.id}
                      className="border-outline-variant p-sm gap-sm flex flex-col rounded-lg border"
                    >
                      <div className="gap-sm flex flex-wrap items-center justify-between">
                        <div>
                          <p className="text-on-surface font-semibold">
                            {descricao}
                          </p>
                          <p className="text-on-surface-variant text-xs">
                            {formatarMoeda(p.valorTotalCentavos)} · {lancadas}/
                            {p.quantidadeParcelas} parcelas lançadas
                          </p>
                        </div>
                        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-semibold">
                          {labelModo(p.modo)}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={processando === p.id}
                          onClick={() => abrirEdicaoModo(p)}
                          className="border-outline-variant bg-surface-container-lowest px-md text-on-surface hover:bg-surface-container-low rounded-full border py-1 text-xs font-semibold disabled:opacity-50"
                        >
                          Mudar modo
                        </button>
                        <button
                          type="button"
                          disabled={processando === p.id}
                          onClick={() => abrirQuitacao(p)}
                          className="border-outline-variant bg-surface-container-lowest px-md text-on-surface hover:bg-surface-container-low rounded-full border py-1 text-xs font-semibold disabled:opacity-50"
                        >
                          Quitar antecipadamente
                        </button>
                        {p.modo === "GRADUAL" &&
                          lancadas < p.quantidadeParcelas && (
                            <button
                              type="button"
                              disabled={processando === p.id}
                              onClick={() => lancarProximaParcela(p)}
                              className="bg-primary px-md text-on-primary rounded-full py-1 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                            >
                              Lançar próxima parcela
                            </button>
                          )}
                      </div>

                      {modoEmEdicaoId === p.id && (
                        <div className="bg-surface-container-low p-sm gap-sm flex flex-wrap items-end rounded-lg">
                          <div className="flex flex-col gap-1">
                            <label className="text-on-surface-variant text-xs font-semibold">
                              Novo modo
                            </label>
                            <Select
                              value={novoModoSelecionado}
                              onChange={setNovoModoSelecionado}
                              options={MODOS_PARCELAMENTO.map((m) => ({
                                value: m.value,
                                label: m.label,
                              }))}
                            />
                          </div>
                          <button
                            type="button"
                            disabled={processando === p.id}
                            onClick={() => confirmarMudancaModo(p)}
                            className="bg-primary px-md text-on-primary rounded-full py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setModoEmEdicaoId(null)}
                            className="text-on-surface-variant text-xs"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}

                      {quitacaoEmEdicaoId === p.id && (
                        <div className="bg-surface-container-low p-sm gap-sm flex flex-wrap items-end rounded-lg">
                          <div className="flex flex-col gap-1">
                            <label className="text-on-surface-variant text-xs font-semibold">
                              Desconto (R$, opcional)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              className={inputClass}
                              value={descontoQuitacao}
                              onChange={(e) =>
                                setDescontoQuitacao(e.target.value)
                              }
                              placeholder="0,00"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-on-surface-variant text-xs font-semibold">
                              Data (opcional)
                            </label>
                            <input
                              type="date"
                              className={inputClass}
                              value={dataQuitacao}
                              onChange={(e) => setDataQuitacao(e.target.value)}
                            />
                          </div>
                          <button
                            type="button"
                            disabled={processando === p.id}
                            onClick={() => confirmarQuitacao(p)}
                            className="bg-primary px-md text-on-primary rounded-full py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                          >
                            Confirmar quitação
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuitacaoEmEdicaoId(null)}
                            className="text-on-surface-variant text-xs"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
