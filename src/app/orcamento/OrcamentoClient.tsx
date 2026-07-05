"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

const MESES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

type Subcategoria = { id: string; nome: string; categoriaId: string };
type Categoria = { id: string; nome: string; subcategorias: Subcategoria[] };
type Pessoa = { id: string; nome: string; tipo: string };
type OrcamentoItem = {
  id: string;
  pessoaId: string | null;
  categoriaId: string;
  subcategoriaId: string | null;
  mes: number | null;
  ano: number;
  valorCentavos: number;
};

// "" = todas as pessoas/grupos; "null" = orçamento do casal/família (sem pessoa)
const GRUPO_FAMILIA = "null";

async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível completar a operação.";
}

function centavosParaReais(valor: number): string {
  return (valor / 100).toFixed(2);
}

function reaisParaCentavos(valor: string): number {
  const n = Number(valor.replace(",", "."));
  return Math.round(n * 100);
}

function chave(
  categoriaId: string,
  subcategoriaId: string | null,
  mes: number | null,
): string {
  return `${categoriaId}|${subcategoriaId ?? ""}|${mes ?? "ANUAL"}`;
}

export function OrcamentoClient() {
  const anoAtual = new Date().getUTCFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [pessoaFiltro, setPessoaFiltro] = useState<string>(GRUPO_FAMILIA);
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [orcamentos, setOrcamentos] = useState<OrcamentoItem[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [naoAutenticado, setNaoAutenticado] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  function recarregar() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      fetch("/api/categorias").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/pessoas").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([cats, pes]) => {
        if (cancelado) return;
        if (cats === null || pes === null) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        setCategorias(cats);
        setPessoas(pes);
      })
      .catch(() => {
        if (!cancelado)
          setErro("Não foi possível carregar categorias/pessoas.");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    const pessoaQuery = pessoaFiltro === "" ? "" : `&pessoaId=${pessoaFiltro}`;
    fetch(`/api/orcamentos?ano=${ano}${pessoaQuery}`)
      .then(async (response) => {
        if (cancelado) return;
        if (response.status === 401) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        setOrcamentos(await response.json());
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar o orçamento.");
      });
    return () => {
      cancelado = true;
    };
  }, [ano, pessoaFiltro, reloadToken]);

  const mapaOrcamentos = useMemo(() => {
    const mapa = new Map<string, OrcamentoItem>();
    for (const o of orcamentos ?? []) {
      mapa.set(chave(o.categoriaId, o.subcategoriaId, o.mes), o);
    }
    return mapa;
  }, [orcamentos]);

  async function salvarCelula(
    categoriaId: string,
    subcategoriaId: string | null,
    mes: number | null,
    valorTexto: string,
  ) {
    setErro(null);
    const existente = mapaOrcamentos.get(
      chave(categoriaId, subcategoriaId, mes),
    );
    const valorCentavos =
      valorTexto.trim() === "" ? 0 : reaisParaCentavos(valorTexto);

    if (existente && valorCentavos === 0) {
      const response = await fetch(`/api/orcamentos/${existente.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setErro(await parseErro(response));
        return;
      }
      recarregar();
      return;
    }

    if (existente) {
      if (existente.valorCentavos === valorCentavos) return;
      const response = await fetch(`/api/orcamentos/${existente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valorCentavos }),
      });
      if (!response.ok) {
        setErro(await parseErro(response));
        return;
      }
      recarregar();
      return;
    }

    if (valorCentavos === 0) return;

    const response = await fetch("/api/orcamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pessoaId: pessoaFiltro === GRUPO_FAMILIA ? null : pessoaFiltro || null,
        categoriaId,
        subcategoriaId,
        mes,
        ano,
        valorCentavos,
      }),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    recarregar();
  }

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para gerenciar o orçamento.
      </p>
    );
  }

  return (
    <div className="gap-lg flex flex-col">
      {erro && (
        <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
          {erro}
        </p>
      )}

      <div className="gap-md flex flex-wrap items-end">
        <div className="flex flex-col gap-1">
          <label
            className="text-on-surface-variant text-xs font-semibold"
            htmlFor="ano"
          >
            Ano
          </label>
          <input
            id="ano"
            type="number"
            className="border-outline-variant bg-surface-container-lowest w-24 rounded-lg border px-2 py-1"
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            className="text-on-surface-variant text-xs font-semibold"
            htmlFor="pessoa"
          >
            Pessoa/grupo
          </label>
          <select
            id="pessoa"
            className="border-outline-variant bg-surface-container-lowest rounded-lg border px-2 py-1"
            value={pessoaFiltro}
            onChange={(e) => setPessoaFiltro(e.target.value)}
          >
            <option value={GRUPO_FAMILIA}>Compartilhado (casa toda)</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-outline-variant bg-surface-container-lowest overflow-x-auto rounded-xl border">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-outline-variant text-on-surface-variant border-b text-xs font-semibold tracking-wide uppercase">
              <th className="bg-surface-container-lowest sticky left-0 p-2 text-left">
                Categoria / Subcategoria
              </th>
              {MESES.map((m) => (
                <th key={m} className="p-2 text-right">
                  {m}
                </th>
              ))}
              <th className="p-2 text-right">Anual</th>
            </tr>
          </thead>
          <tbody>
            {categorias?.map((categoria) => (
              <Fragment key={categoria.id}>
                <LinhaOrcamento
                  label={categoria.nome}
                  categoriaId={categoria.id}
                  subcategoriaId={null}
                  mapaOrcamentos={mapaOrcamentos}
                  onSalvar={salvarCelula}
                  destaque
                />
                {categoria.subcategorias.map((sub) => (
                  <LinhaOrcamento
                    key={sub.id}
                    label={sub.nome}
                    categoriaId={categoria.id}
                    subcategoriaId={sub.id}
                    mapaOrcamentos={mapaOrcamentos}
                    onSalvar={salvarCelula}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {categorias?.length === 0 && (
        <p className="text-on-surface-variant text-sm">
          Nenhuma categoria cadastrada — crie categorias antes de definir o
          orçamento.
        </p>
      )}
    </div>
  );
}

function LinhaOrcamento({
  label,
  categoriaId,
  subcategoriaId,
  mapaOrcamentos,
  onSalvar,
  destaque = false,
}: {
  label: string;
  categoriaId: string;
  subcategoriaId: string | null;
  mapaOrcamentos: Map<string, OrcamentoItem>;
  onSalvar: (
    categoriaId: string,
    subcategoriaId: string | null,
    mes: number | null,
    valorTexto: string,
  ) => Promise<void>;
  destaque?: boolean;
}) {
  return (
    <tr
      className={`border-outline-variant/60 border-b ${
        destaque ? "bg-surface-container-low font-medium" : ""
      }`}
    >
      <td
        className={`sticky left-0 p-2 ${
          destaque
            ? "bg-surface-container-low"
            : "bg-surface-container-lowest pl-6"
        }`}
      >
        {label}
      </td>
      {MESES.map((_, i) => {
        const mes = i + 1;
        const item = mapaOrcamentos.get(
          chave(categoriaId, subcategoriaId, mes),
        );
        return (
          <td key={mes} className="p-1">
            <input
              type="number"
              step="0.01"
              defaultValue={item ? centavosParaReais(item.valorCentavos) : ""}
              key={
                item?.id ?? `${chave(categoriaId, subcategoriaId, mes)}-vazio`
              }
              className="border-outline-variant bg-surface-container-lowest w-24 rounded-lg border px-1.5 py-1 text-right"
              onBlur={(e) =>
                onSalvar(categoriaId, subcategoriaId, mes, e.target.value)
              }
            />
          </td>
        );
      })}
      <td className="p-1">
        <input
          type="number"
          step="0.01"
          defaultValue={
            mapaOrcamentos.get(chave(categoriaId, subcategoriaId, null))
              ? centavosParaReais(
                  mapaOrcamentos.get(chave(categoriaId, subcategoriaId, null))!
                    .valorCentavos,
                )
              : ""
          }
          key={
            mapaOrcamentos.get(chave(categoriaId, subcategoriaId, null))?.id ??
            `${chave(categoriaId, subcategoriaId, null)}-vazio`
          }
          className="border-outline-variant bg-surface-container-lowest w-24 rounded-lg border px-1.5 py-1 text-right font-medium"
          onBlur={(e) =>
            onSalvar(categoriaId, subcategoriaId, null, e.target.value)
          }
        />
      </td>
    </tr>
  );
}
