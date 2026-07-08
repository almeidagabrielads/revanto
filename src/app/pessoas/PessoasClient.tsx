"use client";

import { useEffect, useState } from "react";
import { corPessoa } from "../components/PessoaBadge";
import { useConfirmDialog } from "../components/ConfirmDialog";

const TIPOS_PESSOA = [
  { value: "INDIVIDUAL", label: "Individual" },
  { value: "CASAL", label: "Casal" },
  { value: "FAMILIA", label: "Família" },
  { value: "OUTRO", label: "Outro" },
] as const;

type TipoPessoa = (typeof TIPOS_PESSOA)[number]["value"];

const TIPOS_GRUPO = new Set<TipoPessoa>(["CASAL", "FAMILIA"]);

function labelTipo(tipo: string): string {
  return TIPOS_PESSOA.find((t) => t.value === tipo)?.label ?? tipo;
}

type Integrante = { pessoaId: string; peso: number };

type Pessoa = {
  id: string;
  nome: string;
  tipo: TipoPessoa;
  integrantes: Integrante[];
};

async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível completar a operação.";
}

function IconeLapis() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function IconeLixeira() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function IconeCheck() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconeX() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function PessoasClient() {
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<TipoPessoa>("INDIVIDUAL");
  const [naoAutenticado, setNaoAutenticado] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const { confirmar, dialog: dialogConfirmacao } = useConfirmDialog();

  function carregar() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    let cancelado = false;

    fetch("/api/pessoas")
      .then(async (response) => {
        if (cancelado) return;
        if (response.status === 401) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        setPessoas(await response.json());
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar as pessoas.");
      });

    return () => {
      cancelado = true;
    };
  }, [reloadToken]);

  async function criarPessoa(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const response = await fetch("/api/pessoas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novoNome, tipo: novoTipo }),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    setNovoNome("");
    carregar();
  }

  async function atualizarPessoa(
    id: string,
    input: { nome?: string; tipo?: TipoPessoa },
  ) {
    setErro(null);
    const response = await fetch(`/api/pessoas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return false;
    }
    return true;
  }

  async function definirIntegrantes(grupoId: string, integrantes: Integrante[]) {
    setErro(null);
    const response = await fetch(`/api/pessoas/${grupoId}/integrantes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(integrantes),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return false;
    }
    return true;
  }

  async function salvarPessoa(
    pessoa: Pessoa,
    input: { nome: string; tipo: TipoPessoa },
    integrantes: Integrante[],
  ) {
    if (
      pessoa.integrantes.length > 0 &&
      TIPOS_GRUPO.has(pessoa.tipo) &&
      !TIPOS_GRUPO.has(input.tipo) &&
      !(await confirmar(
        `Mudar o tipo de "${pessoa.nome}" vai apagar a composição de grupo já cadastrada (${pessoa.integrantes.length} integrante(s)). Continuar?`,
      ))
    ) {
      return;
    }

    const ok = await atualizarPessoa(pessoa.id, input);
    if (!ok) return;

    if (TIPOS_GRUPO.has(input.tipo)) {
      const ok2 = await definirIntegrantes(pessoa.id, integrantes);
      if (!ok2) return;
    }

    carregar();
  }

  async function removerPessoa(pessoa: Pessoa) {
    if (
      !(await confirmar(
        `Remover "${pessoa.nome}"? Essa ação não pode ser desfeita.`,
      ))
    ) {
      return;
    }
    setErro(null);
    const response = await fetch(`/api/pessoas/${pessoa.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    carregar();
  }

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para gerenciar pessoas.
      </p>
    );
  }

  return (
    <div className="gap-lg flex flex-col">
      {dialogConfirmacao}

      {erro && (
        <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
          {erro}
        </p>
      )}

      <form
        onSubmit={criarPessoa}
        className="gap-sm border-outline-variant bg-surface-container-lowest p-lg flex flex-wrap items-end rounded-xl border"
      >
        <div className="flex flex-col gap-1">
          <label
            className="text-on-surface-variant text-xs font-semibold"
            htmlFor="novo-nome"
          >
            Nova pessoa
          </label>
          <input
            id="novo-nome"
            className="border-outline-variant bg-surface-container-lowest rounded-lg border px-2 py-1"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            required
          />
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
            className="border-outline-variant bg-surface-container-lowest rounded-lg border px-2 py-1"
            value={novoTipo}
            onChange={(e) => setNovoTipo(e.target.value as TipoPessoa)}
          >
            {TIPOS_PESSOA.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="bg-primary px-md text-on-primary rounded-full py-1.5 text-xs font-semibold hover:opacity-90"
        >
          Adicionar
        </button>
      </form>

      <div className="gap-sm grid grid-cols-1 sm:grid-cols-2">
        {pessoas?.map((pessoa) => (
          <PessoaItem
            key={pessoa.id}
            pessoa={pessoa}
            pessoas={pessoas}
            onSalvar={salvarPessoa}
            onRemover={removerPessoa}
          />
        ))}
      </div>

      {pessoas?.length === 0 && (
        <p className="text-on-surface-variant text-sm">
          Nenhuma pessoa cadastrada.
        </p>
      )}
    </div>
  );
}

function composicaoResumo(pessoa: Pessoa, pessoas: Pessoa[]): string {
  const somaPesos = pessoa.integrantes.reduce((s, i) => s + i.peso, 0);
  return pessoa.integrantes
    .map((i) => {
      const nome = pessoas.find((p) => p.id === i.pessoaId)?.nome ?? "—";
      const percentual = somaPesos > 0 ? (i.peso / somaPesos) * 100 : 0;
      return `${nome} (${percentual.toFixed(0)}%)`;
    })
    .join(" · ");
}

function PessoaItem({
  pessoa,
  pessoas,
  onSalvar,
  onRemover,
}: {
  pessoa: Pessoa;
  pessoas: Pessoa[];
  onSalvar: (
    pessoa: Pessoa,
    input: { nome: string; tipo: TipoPessoa },
    integrantes: Integrante[],
  ) => Promise<void>;
  onRemover: (pessoa: Pessoa) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(pessoa.nome);
  const [tipo, setTipo] = useState<TipoPessoa>(pessoa.tipo);
  const [integrantes, setIntegrantes] = useState<Integrante[]>(
    pessoa.integrantes,
  );

  const individuais = pessoas.filter((p) => p.tipo === "INDIVIDUAL");
  const somaPesos = integrantes.reduce((s, i) => s + i.peso, 0);

  function alternarIntegrante(pessoaId: string, marcado: boolean) {
    setIntegrantes((atual) =>
      marcado
        ? [...atual, { pessoaId, peso: 100 }]
        : atual.filter((i) => i.pessoaId !== pessoaId),
    );
  }

  function mudarPeso(pessoaId: string, peso: number) {
    setIntegrantes((atual) =>
      atual.map((i) => (i.pessoaId === pessoaId ? { ...i, peso } : i)),
    );
  }

  async function salvar() {
    await onSalvar(pessoa, { nome, tipo }, integrantes);
    setEditando(false);
  }

  function cancelar() {
    setNome(pessoa.nome);
    setTipo(pessoa.tipo);
    setIntegrantes(pessoa.integrantes);
    setEditando(false);
  }

  return (
    <div className="border-outline-variant bg-surface-container-lowest p-lg flex flex-col gap-2 rounded-xl border">
      {editando ? (
        <>
          <div className="flex items-center gap-2">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${corPessoa(pessoa.id)}`}
            >
              {nome.charAt(0).toUpperCase() || "?"}
            </span>
            <input
              className="border-outline-variant bg-surface-container-lowest min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <select
              className="border-outline-variant bg-surface-container-lowest rounded-lg border px-2 py-1 text-xs"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoPessoa)}
            >
              {TIPOS_PESSOA.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <button
                title="Salvar"
                aria-label="Salvar"
                onClick={salvar}
                className="text-success hover:bg-success/15 rounded-full p-1.5 transition-colors"
              >
                <IconeCheck />
              </button>
              <button
                title="Cancelar"
                aria-label="Cancelar"
                onClick={cancelar}
                className="text-on-surface-variant hover:bg-surface-container-low rounded-full p-1.5 transition-colors"
              >
                <IconeX />
              </button>
            </div>
          </div>

          {TIPOS_GRUPO.has(tipo) && (
            <div className="border-outline-variant gap-sm mt-1 flex flex-col rounded-lg border p-2">
              <span className="text-on-surface-variant text-xs font-semibold">
                Integrantes do grupo
              </span>
              {individuais.length === 0 ? (
                <p className="text-on-surface-variant text-xs">
                  Nenhuma pessoa Individual cadastrada ainda.
                </p>
              ) : (
                individuais.map((individual) => {
                  const integrante = integrantes.find(
                    (i) => i.pessoaId === individual.id,
                  );
                  const marcado = !!integrante;
                  const percentual =
                    marcado && somaPesos > 0
                      ? ((integrante.peso / somaPesos) * 100).toFixed(0)
                      : null;
                  return (
                    <div
                      key={individual.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) =>
                          alternarIntegrante(individual.id, e.target.checked)
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {individual.nome}
                      </span>
                      {marcado && (
                        <>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            title="Peso"
                            className="border-outline-variant bg-surface-container-lowest w-16 rounded-lg border px-2 py-1 text-xs"
                            value={integrante.peso}
                            onChange={(e) =>
                              mudarPeso(
                                individual.id,
                                Number(e.target.value) || 1,
                              )
                            }
                          />
                          <span className="text-on-surface-variant w-10 text-right text-xs">
                            {percentual}%
                          </span>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${corPessoa(pessoa.id)}`}
            >
              {pessoa.nome.charAt(0).toUpperCase()}
            </span>
            <div>
              <h3 className="text-on-surface text-base font-semibold">
                {pessoa.nome}
              </h3>
              <span className="text-on-surface-variant text-xs font-semibold">
                {labelTipo(pessoa.tipo)}
                {TIPOS_GRUPO.has(pessoa.tipo) &&
                  (pessoa.integrantes.length > 0 ? (
                    <> · {composicaoResumo(pessoa, pessoas)}</>
                  ) : (
                    <span className="text-danger">
                      {" "}
                      · sem integrantes definidos
                    </span>
                  ))}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              title="Editar"
              aria-label="Editar"
              onClick={() => setEditando(true)}
              className="text-primary hover:bg-primary/10 rounded-full p-1.5 transition-colors"
            >
              <IconeLapis />
            </button>
            <button
              title="Remover"
              aria-label="Remover"
              onClick={() => onRemover(pessoa)}
              className="text-danger hover:bg-danger-container rounded-full p-1.5 transition-colors"
            >
              <IconeLixeira />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
