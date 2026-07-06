"use client";

import { useEffect, useState, type ReactNode } from "react";

const MOEDAS = [
  { value: "BRL", label: "Real Brasileiro (BRL)" },
  { value: "USD", label: "Dólar Americano (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
] as const;

const IDIOMAS = [
  { value: "pt-BR", label: "Português (BR)" },
  { value: "en-US", label: "English (US)" },
  { value: "es", label: "Español" },
] as const;

const TEMAS = [
  { value: "CLARO", label: "Claro" },
  { value: "ESCURO", label: "Escuro" },
] as const;

type Preferencias = {
  moeda: string;
  idioma: string;
  tema: string;
};

async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível completar a operação.";
}

function IconeMoeda() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 10v.01" />
      <path d="M18 14v.01" />
    </svg>
  );
}

function IconeGlobo() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
    </svg>
  );
}

function IconeLua() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function PreferenciaCard({
  icone,
  titulo,
  descricao,
  children,
}: {
  icone: ReactNode;
  titulo: string;
  descricao: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
      <div className="flex items-center gap-md">
        <span className="text-on-surface-variant">{icone}</span>
        <div>
          <h3 className="text-sm font-semibold text-on-surface">{titulo}</h3>
          <p className="text-sm text-on-surface-variant">{descricao}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function PreferenciasClient() {
  const [preferencias, setPreferencias] = useState<Preferencias | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [naoAutenticado, setNaoAutenticado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/preferencias")
      .then(async (response) => {
        if (cancelado) return;
        if (response.status === 401) {
          setNaoAutenticado(true);
          return;
        }
        setPreferencias(await response.json());
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar as preferências.");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  async function salvar(patch: Partial<Preferencias>) {
    if (!preferencias) return;
    setErro(null);
    setSalvo(false);
    setSalvando(true);
    const proximo = { ...preferencias, ...patch };
    setPreferencias(proximo);
    const response = await fetch("/api/preferencias", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSalvando(false);
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    setSalvo(true);
  }

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para gerenciar preferências.
      </p>
    );
  }

  if (!preferencias) {
    return <p className="text-sm text-on-surface-variant">Carregando…</p>;
  }

  const selectClass =
    "rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-sm";

  return (
    <div className="flex flex-col gap-lg">
      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger-container p-sm text-sm text-on-danger-container">
          {erro}
        </p>
      )}
      {salvando ? (
        <p className="text-xs text-on-surface-variant">Salvando…</p>
      ) : (
        salvo && <p className="text-xs text-success">Preferências salvas.</p>
      )}

      <div className="flex flex-col gap-md">
        <PreferenciaCard
          icone={<IconeMoeda />}
          titulo="Moeda Principal"
          descricao="Defina a moeda padrão para seus relatórios"
        >
          <select
            aria-label="Moeda principal"
            className={selectClass}
            value={preferencias.moeda}
            onChange={(e) => salvar({ moeda: e.target.value })}
          >
            {MOEDAS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </PreferenciaCard>

        <PreferenciaCard
          icone={<IconeGlobo />}
          titulo="Idioma"
          descricao="Idioma da interface do sistema"
        >
          <select
            aria-label="Idioma"
            className={selectClass}
            value={preferencias.idioma}
            onChange={(e) => salvar({ idioma: e.target.value })}
          >
            {IDIOMAS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </PreferenciaCard>

        <PreferenciaCard
          icone={<IconeLua />}
          titulo="Tema do Sistema"
          descricao="Escolha entre o modo claro ou escuro"
        >
          <div className="flex rounded-full border border-outline-variant p-0.5">
            {TEMAS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => salvar({ tema: t.value })}
                className={
                  preferencias.tema === t.value
                    ? "rounded-full bg-primary px-md py-1 text-xs font-semibold text-on-primary"
                    : "rounded-full px-md py-1 text-xs font-semibold text-on-surface-variant hover:text-on-surface"
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </PreferenciaCard>
      </div>
    </div>
  );
}
