"use client";

import { useEffect, useRef, useState } from "react";
import { extrairValorTela } from "@/lib/domain/valorTela";

type Operador = "+" | "-" | "×" | "÷";
type HistoricoItem = {
  id: string;
  expressao: string;
  resultado: string;
  createdAt: string;
};

const TECLAS: {
  label: string;
  tipo: "digito" | "operador" | "acao";
  valor: string;
}[] = [
  { label: "C", tipo: "acao", valor: "limpar" },
  { label: "⌫", tipo: "acao", valor: "apagar" },
  { label: "%", tipo: "acao", valor: "percentual" },
  { label: "÷", tipo: "operador", valor: "÷" },
  { label: "7", tipo: "digito", valor: "7" },
  { label: "8", tipo: "digito", valor: "8" },
  { label: "9", tipo: "digito", valor: "9" },
  { label: "×", tipo: "operador", valor: "×" },
  { label: "4", tipo: "digito", valor: "4" },
  { label: "5", tipo: "digito", valor: "5" },
  { label: "6", tipo: "digito", valor: "6" },
  { label: "-", tipo: "operador", valor: "-" },
  { label: "1", tipo: "digito", valor: "1" },
  { label: "2", tipo: "digito", valor: "2" },
  { label: "3", tipo: "digito", valor: "3" },
  { label: "+", tipo: "operador", valor: "+" },
];

function limparFloat(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 1e8) / 1e8;
}

function converterParaNumero(display: string): number {
  return Number(display.replace(/\./g, "").replace(",", ".")) || 0;
}

function formatarBruto(valor: number): string {
  return valor.toString().replace(".", ",");
}

function formatarComAgrupamento(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 8 });
}

function calcular(a: number, b: number, op: Operador): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? NaN : a / b;
  }
}

export function CalculadoraLateral() {
  const [aberto, setAberto] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [modoSelecao, setModoSelecao] = useState(false);

  const [display, setDisplay] = useState("0");
  const [acumulado, setAcumulado] = useState<number | null>(null);
  const [operador, setOperador] = useState<Operador | null>(null);
  const [aguardandoOperando, setAguardandoOperando] = useState(false);

  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [anotacao, setAnotacao] = useState("");
  const [statusAnotacao, setStatusAnotacao] = useState<
    "ocioso" | "salvando" | "salvo"
  >("ocioso");

  const painelRef = useRef<HTMLDivElement>(null);
  const timeoutAnotacaoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!aberto || carregado) return;
    let cancelado = false;
    Promise.all([
      fetch("/api/calculadora/historico").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/calculadora/anotacoes").then((r) => (r.ok ? r.json() : null)),
    ]).then(([hist, nota]) => {
      if (cancelado) return;
      setHistorico(hist ?? []);
      setAnotacao(nota?.texto ?? "");
      setCarregado(true);
    });
    return () => {
      cancelado = true;
    };
  }, [aberto, carregado]);

  function alternarAberto() {
    setAberto((v) => {
      if (v) setModoSelecao(false);
      return !v;
    });
  }

  function fechar() {
    setAberto(false);
    setModoSelecao(false);
  }

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  useEffect(() => {
    if (!modoSelecao) return;
    document.body.classList.add("calc-selecionando");

    function aoClicar(event: MouseEvent) {
      const alvo = event.target as HTMLElement | null;
      const elemento = alvo?.closest<HTMLElement>(".data-tabular");
      if (!elemento || painelRef.current?.contains(elemento)) return;
      const valor = extrairValorTela(elemento.textContent ?? "");
      if (valor === null) return;
      event.preventDefault();
      event.stopPropagation();
      inserirValorExterno(valor);
      elemento.classList.add("calc-selecionado-flash");
      setTimeout(
        () => elemento.classList.remove("calc-selecionado-flash"),
        500,
      );
    }

    document.addEventListener("click", aoClicar, true);
    return () => {
      document.body.classList.remove("calc-selecionando");
      document.removeEventListener("click", aoClicar, true);
    };
  }, [modoSelecao]);

  useEffect(() => {
    return () => {
      if (timeoutAnotacaoRef.current) clearTimeout(timeoutAnotacaoRef.current);
    };
  }, []);

  function inserirValorExterno(valor: number) {
    setDisplay(formatarBruto(limparFloat(valor)));
    setAguardandoOperando(false);
  }

  function digitar(d: string) {
    if (aguardandoOperando) {
      setDisplay(d === "," ? "0," : d);
      setAguardandoOperando(false);
      return;
    }
    if (d === "," && display.includes(",")) return;
    if (display === "0" && d !== ",") {
      setDisplay(d);
      return;
    }
    if (display.replace(/[,-]/g, "").length >= 15) return;
    setDisplay(display + d);
  }

  function apagar() {
    if (aguardandoOperando) return;
    setDisplay((atual) => (atual.length <= 1 ? "0" : atual.slice(0, -1)));
  }

  function limparTudo() {
    setDisplay("0");
    setAcumulado(null);
    setOperador(null);
    setAguardandoOperando(false);
  }

  function aplicarPercentual() {
    const valor = converterParaNumero(display);
    setDisplay(formatarBruto(limparFloat(valor / 100)));
  }

  function aplicarOperador(novo: Operador) {
    const atual = converterParaNumero(display);
    if (operador && !aguardandoOperando && acumulado !== null) {
      const resultado = limparFloat(calcular(acumulado, atual, operador));
      setAcumulado(resultado);
      setDisplay(formatarBruto(resultado));
    } else {
      setAcumulado(atual);
    }
    setOperador(novo);
    setAguardandoOperando(true);
  }

  async function calcularIgual() {
    if (operador == null || acumulado == null) return;
    const atual = converterParaNumero(display);
    const resultado = calcular(acumulado, atual, operador);
    if (!Number.isFinite(resultado)) {
      setDisplay("Erro");
      setAcumulado(null);
      setOperador(null);
      setAguardandoOperando(true);
      return;
    }
    const resultadoLimpo = limparFloat(resultado);
    const expressao = `${formatarComAgrupamento(acumulado)} ${operador} ${formatarComAgrupamento(atual)}`;
    const resultadoTexto = formatarComAgrupamento(resultadoLimpo);
    setDisplay(formatarBruto(resultadoLimpo));
    setAcumulado(null);
    setOperador(null);
    setAguardandoOperando(true);
    await salvarHistorico(expressao, resultadoTexto);
  }

  async function salvarHistorico(expressao: string, resultado: string) {
    const response = await fetch("/api/calculadora/historico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expressao, resultado }),
    });
    if (response.ok) {
      const item = await response.json();
      setHistorico((atual) => [item, ...atual].slice(0, 100));
    }
  }

  async function removerItemHistorico(id: string) {
    setHistorico((atual) => atual.filter((h) => h.id !== id));
    await fetch(`/api/calculadora/historico/${id}`, { method: "DELETE" });
  }

  async function limparHistoricoTudo() {
    setHistorico([]);
    await fetch("/api/calculadora/historico", { method: "DELETE" });
  }

  function alterarAnotacao(texto: string) {
    setAnotacao(texto);
    setStatusAnotacao("ocioso");
    if (timeoutAnotacaoRef.current) clearTimeout(timeoutAnotacaoRef.current);
    timeoutAnotacaoRef.current = setTimeout(async () => {
      setStatusAnotacao("salvando");
      const response = await fetch("/api/calculadora/anotacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      setStatusAnotacao(response.ok ? "salvo" : "ocioso");
    }, 800);
  }

  function aoTeclarNoTeclado(e: React.KeyboardEvent) {
    if (/^[0-9]$/.test(e.key)) {
      digitar(e.key);
    } else if (e.key === "," || e.key === ".") {
      digitar(",");
    } else if (e.key === "+") {
      aplicarOperador("+");
    } else if (e.key === "-") {
      aplicarOperador("-");
    } else if (e.key === "*") {
      aplicarOperador("×");
    } else if (e.key === "/") {
      e.preventDefault();
      aplicarOperador("÷");
    } else if (e.key === "Enter" || e.key === "=") {
      e.preventDefault();
      calcularIgual();
    } else if (e.key === "Backspace") {
      apagar();
    } else if (e.key.toLowerCase() === "c") {
      limparTudo();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={alternarAberto}
        title="Calculadora"
        aria-label="Calculadora"
        aria-pressed={aberto}
        className={
          aberto
            ? "bg-primary/10 text-primary rounded-full p-1.5 transition-colors"
            : "text-on-surface-variant hover:bg-surface-container hover:text-primary rounded-full p-1.5 transition-colors"
        }
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
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <line x1="8" y1="11" x2="8" y2="11.01" />
          <line x1="12" y1="11" x2="12" y2="11.01" />
          <line x1="16" y1="11" x2="16" y2="11.01" />
          <line x1="8" y1="15" x2="8" y2="15.01" />
          <line x1="12" y1="15" x2="12" y2="15.01" />
          <line x1="16" y1="15" x2="16" y2="15.01" />
          <line x1="8" y1="19" x2="8" y2="19.01" />
          <line x1="12" y1="19" x2="12" y2="19.01" />
        </svg>
      </button>

      {aberto && (
        <div
          ref={painelRef}
          className="border-outline-variant bg-surface-container-lowest fixed top-16 right-0 bottom-0 z-[90] flex w-full max-w-[22rem] flex-col overflow-y-auto border-l shadow-lg sm:max-w-[26rem]"
        >
          <div className="border-outline-variant p-md flex items-center justify-between border-b">
            <h2 className="text-on-surface text-base font-bold">Calculadora</h2>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar calculadora"
              className="text-on-surface-variant hover:bg-surface-container rounded-full p-1.5"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div
            className="gap-sm p-md flex flex-col"
            tabIndex={0}
            onKeyDown={aoTeclarNoTeclado}
          >
            <button
              type="button"
              onClick={() => setModoSelecao((v) => !v)}
              className={
                modoSelecao
                  ? "bg-secondary text-on-secondary gap-xs px-sm flex items-center justify-center rounded-lg py-1.5 text-xs font-semibold"
                  : "border-outline-variant text-on-surface-variant gap-xs px-sm hover:bg-surface-container-low flex items-center justify-center rounded-lg border py-1.5 text-xs font-semibold"
              }
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <circle
                  cx="12"
                  cy="12"
                  r="1.5"
                  fill="currentColor"
                  stroke="none"
                />
                <line x1="12" y1="2" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="2" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="22" y2="12" />
              </svg>
              {modoSelecao
                ? "Clique em um valor da tela"
                : "Selecionar valor da tela"}
            </button>

            <div className="bg-surface-container p-md rounded-xl text-right">
              {operador && (
                <div className="text-on-surface-variant text-xs">
                  {acumulado !== null ? formatarComAgrupamento(acumulado) : ""}{" "}
                  {operador}
                </div>
              )}
              <div className="data-tabular text-on-surface truncate text-2xl">
                {display}
              </div>
            </div>

            <div className="gap-xs grid grid-cols-4">
              {TECLAS.map((tecla) => (
                <button
                  key={tecla.label}
                  type="button"
                  onClick={() => {
                    if (tecla.tipo === "digito") digitar(tecla.valor);
                    else if (tecla.tipo === "operador")
                      aplicarOperador(tecla.valor as Operador);
                    else if (tecla.valor === "limpar") limparTudo();
                    else if (tecla.valor === "apagar") apagar();
                    else if (tecla.valor === "percentual") aplicarPercentual();
                  }}
                  className={
                    tecla.tipo === "operador"
                      ? "bg-primary text-on-primary rounded-lg py-2.5 text-sm font-semibold hover:opacity-90"
                      : tecla.tipo === "acao"
                        ? "bg-surface-container-high text-on-surface-variant rounded-lg py-2.5 text-sm font-semibold hover:opacity-90"
                        : "bg-surface-container-low text-on-surface hover:bg-surface-container-high rounded-lg py-2.5 text-sm font-semibold"
                  }
                >
                  {tecla.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => digitar("0")}
                className="bg-surface-container-low text-on-surface hover:bg-surface-container-high col-span-2 rounded-lg py-2.5 text-sm font-semibold"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => digitar(",")}
                className="bg-surface-container-low text-on-surface hover:bg-surface-container-high rounded-lg py-2.5 text-sm font-semibold"
              >
                ,
              </button>
              <button
                type="button"
                onClick={calcularIgual}
                className="bg-secondary text-on-secondary rounded-lg py-2.5 text-sm font-semibold hover:opacity-90"
              >
                =
              </button>
            </div>
          </div>

          <div className="border-outline-variant p-md gap-sm flex flex-col border-t">
            <div className="flex items-center justify-between">
              <h3 className="text-on-surface-variant text-xs font-bold">
                Histórico
              </h3>
              {historico.length > 0 && (
                <button
                  type="button"
                  onClick={limparHistoricoTudo}
                  className="text-danger text-xs font-semibold hover:opacity-80"
                >
                  Limpar
                </button>
              )}
            </div>
            {historico.length === 0 ? (
              <p className="text-on-surface-variant text-xs">
                Nenhum cálculo ainda.
              </p>
            ) : (
              <ul className="gap-xs flex max-h-40 flex-col overflow-y-auto">
                {historico.map((item) => (
                  <li
                    key={item.id}
                    className="group flex items-center justify-between gap-2 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        inserirValorExterno(converterParaNumero(item.resultado))
                      }
                      className="flex-1 truncate text-left"
                      title="Usar este resultado"
                    >
                      <span className="text-on-surface-variant">
                        {item.expressao} ={" "}
                      </span>
                      <span className="data-tabular text-on-surface font-semibold">
                        {item.resultado}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removerItemHistorico(item.id)}
                      aria-label="Remover do histórico"
                      className="text-on-surface-variant hover:text-danger opacity-0 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-md gap-sm flex flex-1 flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-on-surface-variant text-xs font-bold">
                Anotações
              </h3>
              <span className="text-on-surface-variant text-[10px]">
                {statusAnotacao === "salvando"
                  ? "Salvando..."
                  : statusAnotacao === "salvo"
                    ? "Salvo"
                    : ""}
              </span>
            </div>
            <textarea
              value={anotacao}
              onChange={(e) => alterarAnotacao(e.target.value)}
              placeholder="Anote algo..."
              className="border-outline-variant bg-surface-container-lowest p-sm focus:border-primary min-h-24 flex-1 resize-none rounded-lg border text-sm focus:outline-none"
            />
          </div>
        </div>
      )}
    </>
  );
}
