"use client";

import { useEffect, useState, type FormEvent } from "react";

type Subcategoria = {
  id: string;
  nome: string;
  categoriaId: string;
  orcamentoCentavos: number | null;
  ativo: boolean;
};

type Categoria = {
  id: string;
  nome: string;
  ativo: boolean;
  subcategorias: Subcategoria[];
};

async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível completar a operação.";
}

function centavosParaReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function reaisParaCentavos(valor: string): number | null {
  const normalizado = valor.trim().replace(",", ".");
  if (normalizado === "") return null;
  const numero = Number(normalizado);
  if (Number.isNaN(numero)) return null;
  return Math.round(numero * 100);
}

function somaOrcamentoCategoria(categoria: Categoria): number {
  return categoria.subcategorias
    .filter((s) => s.ativo)
    .reduce((total, s) => total + (s.orcamentoCentavos ?? 0), 0);
}

function IconePasta() {
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
      <path d="M4 4h6l2 2h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
    </svg>
  );
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

function IconeInativar() {
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
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <path d="M12 2v10" />
    </svg>
  );
}

function IconeReativar() {
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
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function IconeMais() {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function CategoriasClient() {
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [naoAutenticado, setNaoAutenticado] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  function carregar() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    let cancelado = false;

    fetch(`/api/categorias${mostrarInativas ? "?incluirInativas=true" : ""}`)
      .then(async (response) => {
        if (cancelado) return;
        if (response.status === 401) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        setCategorias(await response.json());
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar as categorias.");
      });

    return () => {
      cancelado = true;
    };
  }, [mostrarInativas, reloadToken]);

  async function criarCategoria(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const response = await fetch("/api/categorias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novoNome }),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    setNovoNome("");
    carregar();
  }

  async function atualizarCategoria(id: string, nome: string) {
    setErro(null);
    const response = await fetch(`/api/categorias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    carregar();
  }

  async function alternarAtivo(categoria: Categoria) {
    setErro(null);
    const acao = categoria.ativo ? "inativar" : "reativar";
    const response = await fetch(`/api/categorias/${categoria.id}/${acao}`, {
      method: "POST",
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    carregar();
  }

  async function criarSubcategoria(
    categoriaId: string,
    nome: string,
    orcamentoCentavos: number | null,
  ) {
    setErro(null);
    const response = await fetch("/api/subcategorias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, categoriaId, orcamentoCentavos }),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    carregar();
  }

  async function atualizarSubcategoria(
    id: string,
    input: { nome?: string; orcamentoCentavos?: number | null },
  ) {
    setErro(null);
    const response = await fetch(`/api/subcategorias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    carregar();
  }

  async function alternarAtivoSubcategoria(subcategoria: Subcategoria) {
    setErro(null);
    const acao = subcategoria.ativo ? "inativar" : "reativar";
    const response = await fetch(
      `/api/subcategorias/${subcategoria.id}/${acao}`,
      { method: "POST" },
    );
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    carregar();
  }

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para gerenciar categorias.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger-container p-sm text-sm text-on-danger-container">
          {erro}
        </p>
      )}

      <form
        onSubmit={criarCategoria}
        className="flex flex-wrap items-end gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-lg"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-on-surface-variant" htmlFor="novo-nome">
            Nova categoria
          </label>
          <input
            id="novo-nome"
            className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="rounded-full bg-primary px-md py-1.5 text-xs font-semibold text-on-primary hover:opacity-90"
        >
          Adicionar
        </button>
      </form>

      <label className="flex items-center gap-2 text-sm text-on-surface-variant">
        <input
          type="checkbox"
          checked={mostrarInativas}
          onChange={(e) => setMostrarInativas(e.target.checked)}
        />
        Mostrar categorias inativas
      </label>

      <div className="flex flex-col gap-md">
        {categorias?.map((categoria) => (
          <CategoriaItem
            key={categoria.id}
            categoria={categoria}
            onAtualizar={atualizarCategoria}
            onAlternarAtivo={alternarAtivo}
            onCriarSubcategoria={criarSubcategoria}
            onAtualizarSubcategoria={atualizarSubcategoria}
            onAlternarAtivoSubcategoria={alternarAtivoSubcategoria}
          />
        ))}
      </div>

      {categorias?.length === 0 && (
        <p className="text-sm text-on-surface-variant">Nenhuma categoria encontrada.</p>
      )}
    </div>
  );
}

function CategoriaItem({
  categoria,
  onAtualizar,
  onAlternarAtivo,
  onCriarSubcategoria,
  onAtualizarSubcategoria,
  onAlternarAtivoSubcategoria,
}: {
  categoria: Categoria;
  onAtualizar: (id: string, nome: string) => Promise<void>;
  onAlternarAtivo: (categoria: Categoria) => Promise<void>;
  onCriarSubcategoria: (
    categoriaId: string,
    nome: string,
    orcamentoCentavos: number | null,
  ) => Promise<void>;
  onAtualizarSubcategoria: (
    id: string,
    input: { nome?: string; orcamentoCentavos?: number | null },
  ) => Promise<void>;
  onAlternarAtivoSubcategoria: (subcategoria: Subcategoria) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(categoria.nome);
  const [novaSubNome, setNovaSubNome] = useState("");
  const [novaSubValor, setNovaSubValor] = useState("");

  async function salvar() {
    await onAtualizar(categoria.id, nome);
    setEditando(false);
  }

  function cancelar() {
    setNome(categoria.nome);
    setEditando(false);
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border border-outline-variant ${
        categoria.ativo ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-center justify-between gap-2 bg-primary-container/20 p-lg">
        {editando ? (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-on-surface-variant">
                <IconePasta />
              </span>
              <input
                className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-sm"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                title="Salvar"
                aria-label="Salvar"
                onClick={salvar}
                className="rounded-full p-1.5 text-success transition-colors hover:bg-success/15"
              >
                <IconeCheck />
              </button>
              <button
                title="Cancelar"
                aria-label="Cancelar"
                onClick={cancelar}
                className="rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-low"
              >
                <IconeX />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-on-surface-variant">
                <IconePasta />
              </span>
              <h3 className="text-base font-semibold text-on-surface">
                {categoria.nome}
              </h3>
              {!categoria.ativo && (
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant">
                  inativa
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-on-surface">
                Limite: R$ {centavosParaReais(somaOrcamentoCategoria(categoria))}
              </span>
              <div className="flex items-center gap-1">
                <button
                  title="Editar"
                  aria-label="Editar"
                  onClick={() => setEditando(true)}
                  className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary/10"
                >
                  <IconeLapis />
                </button>
                <button
                  title={categoria.ativo ? "Inativar" : "Reativar"}
                  aria-label={categoria.ativo ? "Inativar" : "Reativar"}
                  onClick={() => onAlternarAtivo(categoria)}
                  className={
                    categoria.ativo
                      ? "rounded-full p-1.5 text-danger transition-colors hover:bg-danger-container"
                      : "rounded-full p-1.5 text-success transition-colors hover:bg-success/15"
                  }
                >
                  {categoria.ativo ? <IconeInativar /> : <IconeReativar />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col">
        {categoria.subcategorias.map((subcategoria) => (
          <SubcategoriaItem
            key={subcategoria.id}
            subcategoria={subcategoria}
            onAtualizar={onAtualizarSubcategoria}
            onAlternarAtivo={onAlternarAtivoSubcategoria}
          />
        ))}
      </div>

      <form
        className="flex flex-wrap items-center gap-2 border-t border-outline-variant p-lg"
        onSubmit={async (e) => {
          e.preventDefault();
          await onCriarSubcategoria(
            categoria.id,
            novaSubNome,
            reaisParaCentavos(novaSubValor),
          );
          setNovaSubNome("");
          setNovaSubValor("");
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-sm"
          placeholder="Nova subcategoria"
          value={novaSubNome}
          onChange={(e) => setNovaSubNome(e.target.value)}
          required
        />
        <input
          className="w-28 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-sm"
          placeholder="R$ 0,00"
          inputMode="decimal"
          value={novaSubValor}
          onChange={(e) => setNovaSubValor(e.target.value)}
        />
        <button
          type="submit"
          title="Adicionar subcategoria"
          aria-label="Adicionar subcategoria"
          className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary/10"
        >
          <IconeMais />
        </button>
      </form>
    </div>
  );
}

function SubcategoriaItem({
  subcategoria,
  onAtualizar,
  onAlternarAtivo,
}: {
  subcategoria: Subcategoria;
  onAtualizar: (
    id: string,
    input: { nome?: string; orcamentoCentavos?: number | null },
  ) => Promise<void>;
  onAlternarAtivo: (subcategoria: Subcategoria) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(subcategoria.nome);
  const [valor, setValor] = useState(
    subcategoria.orcamentoCentavos != null
      ? centavosParaReais(subcategoria.orcamentoCentavos)
      : "",
  );

  async function salvar() {
    await onAtualizar(subcategoria.id, {
      nome,
      orcamentoCentavos: reaisParaCentavos(valor),
    });
    setEditando(false);
  }

  function cancelar() {
    setNome(subcategoria.nome);
    setValor(
      subcategoria.orcamentoCentavos != null
        ? centavosParaReais(subcategoria.orcamentoCentavos)
        : "",
    );
    setEditando(false);
  }

  return (
    <div
      className={`flex items-center justify-between gap-2 border-t border-outline-variant px-lg py-sm ${
        subcategoria.ativo ? "" : "opacity-60"
      }`}
    >
      {editando ? (
        <>
          <input
            className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-sm"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
          />
          <input
            className="w-28 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-sm"
            placeholder="R$ 0,00"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          <div className="flex items-center gap-1">
            <button
              title="Salvar"
              aria-label="Salvar"
              onClick={salvar}
              className="rounded-full p-1.5 text-success transition-colors hover:bg-success/15"
            >
              <IconeCheck />
            </button>
            <button
              title="Cancelar"
              aria-label="Cancelar"
              onClick={cancelar}
              className="rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-low"
            >
              <IconeX />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface">{subcategoria.nome}</span>
            {!subcategoria.ativo && (
              <span className="rounded-full bg-surface-container px-1.5 py-0.5 text-xs text-on-surface-variant">
                inativa
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-on-surface-variant">
              {subcategoria.orcamentoCentavos != null
                ? `R$ ${centavosParaReais(subcategoria.orcamentoCentavos)}`
                : "sem orçamento"}
            </span>
            <div className="flex items-center gap-1">
              <button
                title="Editar"
                aria-label="Editar"
                onClick={() => setEditando(true)}
                className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary/10"
              >
                <IconeLapis />
              </button>
              <button
                title={subcategoria.ativo ? "Inativar" : "Reativar"}
                aria-label={subcategoria.ativo ? "Inativar" : "Reativar"}
                onClick={() => onAlternarAtivo(subcategoria)}
                className={
                  subcategoria.ativo
                    ? "rounded-full p-1.5 text-danger transition-colors hover:bg-danger-container"
                    : "rounded-full p-1.5 text-success transition-colors hover:bg-success/15"
                }
              >
                {subcategoria.ativo ? <IconeInativar /> : <IconeReativar />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
