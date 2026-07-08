"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { corPessoa } from "../components/PessoaBadge";
import { ColumnHeader } from "../components/ColumnHeader";
import { useTabela, type ColunaTabela } from "../components/useTabela";

type Pessoa = { id: string; nome: string; tipo: string };
type SaldoPessoa = { pessoaId: string; saldoCentavos: number };
type Transferencia = { deId: string; paraId: string; valorCentavos: number };
type TotalPagoPessoa = { pessoaId: string; totalCentavos: number };
type LancamentoDetalhe = {
  id: string;
  data: string;
  descricao: string;
  categoriaNome: string | null;
  valorCentavos: number;
  pessoaDivisaoId: string;
};
type Insight = { categoriaNome: string; pessoaId: string } | null;
type GrupoSemComposicao = { pessoaId: string; nome: string };

type Resumo = {
  participantes: string[];
  saldosPorPessoa: SaldoPessoa[];
  transferenciasSugeridas: Transferencia[];
  totalPagoPorPessoa: TotalPagoPessoa[];
  lancamentos: LancamentoDetalhe[];
  insight: Insight;
  gruposSemComposicao: GrupoSemComposicao[];
};

type Acerto = {
  id: string;
  dataInicio: string;
  dataFim: string;
  valorCentavos: number;
  resolvidoEm: string;
  de: { id: string; nome: string };
  para: { id: string; nome: string };
};

const BARRAS = ["bg-secondary", "bg-tertiary", "bg-success", "bg-danger"] as const;

function hashSimples(texto: string): number {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    hash = (hash * 31 + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function corBarra(pessoaId: string): string {
  return BARRAS[hashSimples(pessoaId) % BARRAS.length];
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function primeiroDiaDoMes(): string {
  const hoje = new Date();
  return formatarDataISO(
    new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)),
  );
}

function ultimoDiaDoMes(): string {
  const hoje = new Date();
  return formatarDataISO(
    new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)),
  );
}

function centavosParaReais(valor: number): string {
  return (valor / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function nomeMes(iso: string): string {
  const nome = new Date(iso).toLocaleDateString("pt-BR", {
    month: "long",
    timeZone: "UTC",
  });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível completar a operação.";
}

function IconeHistorico() {
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
      <path d="M3 3v5h5" />
      <path d="M3.05 13a9 9 0 1 0 .5-4.5L3 8" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function IconeChecklist() {
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
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

export function DivisaoClient() {
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes());
  const [dataFim, setDataFim] = useState(ultimoDiaDoMes());
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [historico, setHistorico] = useState<Acerto[]>([]);
  const [buscou, setBuscou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [naoAutenticado, setNaoAutenticado] = useState(false);
  const [resolvendo, setResolvendo] = useState(false);
  const [resolvido, setResolvido] = useState(false);
  const [filtroPessoa, setFiltroPessoa] = useState("");
  const [mostrarTodosLancamentos, setMostrarTodosLancamentos] = useState(false);
  const [mostrarHistoricoCompleto, setMostrarHistoricoCompleto] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/pessoas")
      .then(async (response) => {
        if (cancelado) return;
        if (response.status === 401) {
          setNaoAutenticado(true);
          return;
        }
        setPessoas(await response.json());
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar as pessoas.");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/relatorios/divisao?dataInicio=${dataInicio}&dataFim=${dataFim}`)
      .then(async (response) => {
        if (cancelado) return;
        if (response.status === 401) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        if (!response.ok) {
          setErro("Não foi possível calcular o acerto de contas.");
          setResumo(null);
          return;
        }
        setErro(null);
        setResumo(await response.json());
        setBuscou(true);
      })
      .catch(() => {
        if (!cancelado)
          setErro("Não foi possível calcular o acerto de contas.");
      });
    return () => {
      cancelado = true;
    };
  }, [dataInicio, dataFim, reloadToken]);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/acertos")
      .then(async (response) => {
        if (cancelado || !response.ok) return;
        setHistorico(await response.json());
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [reloadToken]);

  const nomePorId = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of pessoas) mapa.set(p.id, p.nome);
    return mapa;
  }, [pessoas]);

  function nome(id: string): string {
    return nomePorId.get(id) ?? id;
  }

  async function resolverAcerto() {
    setErro(null);
    setResolvendo(true);
    setResolvido(false);
    const response = await fetch("/api/acertos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataInicio, dataFim }),
    });
    setResolvendo(false);
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    setResolvido(true);
    setReloadToken((t) => t + 1);
  }

  const lancamentosFiltrados =
    resumo?.lancamentos.filter(
      (l) => !filtroPessoa || l.pessoaDivisaoId === filtroPessoa,
    ) ?? [];

  const colunasLancamentos = useMemo<ColunaTabela<LancamentoDetalhe>[]>(
    () => [
      { chave: "descricao", tipo: "texto", acessor: (l) => l.descricao || "" },
      {
        chave: "responsavel",
        tipo: "opcoes",
        acessor: (l) => nome(l.pessoaDivisaoId),
      },
      {
        chave: "categoria",
        tipo: "opcoes",
        acessor: (l) => l.categoriaNome ?? "Sem categoria",
      },
      { chave: "valor", tipo: "numero", acessor: (l) => l.valorCentavos / 100 },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nomePorId],
  );

  const {
    linhas: lancamentosProcessados,
    ordenacao,
    alternarOrdenacao,
    filtros,
    definirFiltro,
    limparFiltro,
  } = useTabela(lancamentosFiltrados, colunasLancamentos);

  const opcoesColunasLancamentos = useMemo(() => {
    const unicos = (valores: string[]) =>
      [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      responsavel: unicos(
        lancamentosFiltrados.map((l) => nome(l.pessoaDivisaoId)),
      ),
      categoria: unicos(
        lancamentosFiltrados.map((l) => l.categoriaNome ?? "Sem categoria"),
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentosFiltrados]);

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para ver o acerto de contas.
      </p>
    );
  }

  const totalPagoGeral =
    resumo?.totalPagoPorPessoa.reduce((s, t) => s + t.totalCentavos, 0) ?? 0;

  const lancamentosVisiveis = mostrarTodosLancamentos
    ? lancamentosProcessados
    : lancamentosProcessados.slice(0, 6);

  const historicoVisivel = mostrarHistoricoCompleto
    ? historico
    : historico.slice(0, 3);

  return (
    <div className="flex flex-col gap-lg">
      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger-container p-sm text-sm text-on-danger-container">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-md">
        <div className="flex flex-wrap items-end gap-md">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-on-surface-variant" htmlFor="dataInicio">
              De
            </label>
            <input
              id="dataInicio"
              type="date"
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-on-surface-variant" htmlFor="dataFim">
              Até
            </label>
            <input
              id="dataFim"
              type="date"
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>
          {resumo && resumo.participantes.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant" htmlFor="filtroPessoa">
                Filtrar por pessoa
              </label>
              <select
                id="filtroPessoa"
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1"
                value={filtroPessoa}
                onChange={(e) => setFiltroPessoa(e.target.value)}
              >
                <option value="">Todos</option>
                {resumo.participantes.map((id) => (
                  <option key={id} value={id}>
                    {nome(id)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {resumo && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={resolverAcerto}
              disabled={resolvendo || resumo.transferenciasSugeridas.length === 0}
              className="flex items-center gap-1.5 rounded-full bg-primary px-md py-1.5 text-xs font-semibold text-on-primary hover:opacity-90 disabled:opacity-50"
            >
              <IconeChecklist />
              {resolvendo ? "Resolvendo…" : "Resolver acerto"}
            </button>
            {resolvido && (
              <span className="text-xs text-success">Acerto registrado.</span>
            )}
          </div>
        )}
      </div>

      {buscou && resumo === null && (
        <p className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg text-sm text-on-surface-variant">
          É preciso cadastrar pelo menos duas pessoas do tipo Individual em{" "}
          <Link href="/pessoas" className="font-medium text-primary hover:underline">
            Pessoas
          </Link>{" "}
          para calcular o acerto de contas. Uma casa com uma única pessoa não
          tem o que dividir.
        </p>
      )}

      {resumo && resumo.gruposSemComposicao.length > 0 && (
        <p className="rounded-xl border border-danger/30 bg-danger-container p-lg text-sm text-on-danger-container">
          {resumo.gruposSemComposicao.map((g) => g.nome).join(", ")}{" "}
          {resumo.gruposSemComposicao.length === 1 ? "não tem" : "não têm"}{" "}
          integrantes cadastrados — os gastos atribuídos a{" "}
          {resumo.gruposSemComposicao.length === 1 ? "esse grupo" : "esses grupos"}{" "}
          neste período ficaram de fora do acerto. Configure a composição em{" "}
          <Link href="/pessoas" className="font-medium underline">
            Pessoas
          </Link>
          .
        </p>
      )}

      {resumo && (
        <>
          <div className="grid grid-cols-1 gap-md lg:grid-cols-3">
            {resumo.participantes.map((id) => {
              const pago =
                resumo.totalPagoPorPessoa.find((t) => t.pessoaId === id)
                  ?.totalCentavos ?? 0;
              const percentual =
                totalPagoGeral > 0 ? (pago / totalPagoGeral) * 100 : 0;
              return (
                <div
                  key={id}
                  className="flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${corPessoa(id)}`}
                    >
                      {nome(id).charAt(0).toUpperCase()}
                    </span>
                    <h3 className="text-base font-semibold text-on-surface">
                      {nome(id)}
                    </h3>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">Pagou no total</p>
                    <p className="text-2xl font-bold text-on-surface">
                      {centavosParaReais(pago)}
                    </p>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                    <div
                      className={`h-full rounded-full ${corBarra(id)}`}
                      style={{ width: `${percentual}%` }}
                    />
                  </div>
                </div>
              );
            })}

            <div className="flex flex-col justify-center gap-2 rounded-xl bg-primary p-lg text-on-primary lg:col-span-1">
              <h3 className="text-center text-xs font-semibold uppercase tracking-wide text-on-primary/70">
                Resultado do período
              </h3>
              {resumo.transferenciasSugeridas.length === 0 ? (
                <p className="text-center text-lg font-semibold">
                  Contas quitadas 🎉
                </p>
              ) : (
                <div className="flex flex-col gap-1 text-center">
                  {resumo.transferenciasSugeridas.map((t, i) => (
                    <p key={i} className="text-lg font-bold">
                      {nome(t.deId)} deve {centavosParaReais(t.valorCentavos)}{" "}
                      para {nome(t.paraId)}
                    </p>
                  ))}
                  <p className="text-sm text-on-primary/70">
                    Baseado nos gastos compartilhados do período
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-md lg:grid-cols-3">
            <div className="flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-lg lg:col-span-2">
              <h3 className="text-base font-semibold text-on-surface">
                Detalhamento compartilhado
              </h3>
              <div className="overflow-hidden rounded-lg border border-outline-variant">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container-low text-left text-xs font-semibold text-on-surface-variant">
                    <tr>
                      <ColumnHeader
                        label="Despesa"
                        chave="descricao"
                        tipo="texto"
                        ordenacao={ordenacao}
                        onOrdenar={alternarOrdenacao}
                        filtro={filtros.descricao}
                        onFiltrar={definirFiltro}
                        onLimparFiltro={limparFiltro}
                      />
                      <ColumnHeader
                        label="Responsável"
                        chave="responsavel"
                        tipo="opcoes"
                        opcoes={opcoesColunasLancamentos.responsavel}
                        ordenacao={ordenacao}
                        onOrdenar={alternarOrdenacao}
                        filtro={filtros.responsavel}
                        onFiltrar={definirFiltro}
                        onLimparFiltro={limparFiltro}
                      />
                      <ColumnHeader
                        label="Categoria"
                        chave="categoria"
                        tipo="opcoes"
                        opcoes={opcoesColunasLancamentos.categoria}
                        ordenacao={ordenacao}
                        onOrdenar={alternarOrdenacao}
                        filtro={filtros.categoria}
                        onFiltrar={definirFiltro}
                        onLimparFiltro={limparFiltro}
                      />
                      <ColumnHeader
                        label="Valor"
                        chave="valor"
                        tipo="numero"
                        align="right"
                        ordenacao={ordenacao}
                        onOrdenar={alternarOrdenacao}
                        filtro={filtros.valor}
                        onFiltrar={definirFiltro}
                        onLimparFiltro={limparFiltro}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentosVisiveis.map((l) => (
                      <tr key={l.id} className="border-t border-outline-variant">
                        <td className="p-sm">
                          {l.descricao || "—"}
                          <span className="ml-2 text-xs text-on-surface-variant">
                            {formatarDataCurta(l.data)}
                          </span>
                        </td>
                        <td className="p-sm">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${corPessoa(l.pessoaDivisaoId)}`}
                          >
                            {nome(l.pessoaDivisaoId).charAt(0).toUpperCase()}
                          </span>
                        </td>
                        <td className="p-sm text-on-surface-variant">
                          {l.categoriaNome ?? "Sem categoria"}
                        </td>
                        <td className="p-sm text-right font-medium">
                          {centavosParaReais(l.valorCentavos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lancamentosProcessados.length > 6 && (
                <button
                  onClick={() => setMostrarTodosLancamentos((v) => !v)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {mostrarTodosLancamentos
                    ? "Mostrar menos"
                    : `Ver todas as ${lancamentosProcessados.length} despesas deste período`}
                </button>
              )}
              {lancamentosProcessados.length === 0 && (
                <p className="text-sm text-on-surface-variant">
                  {lancamentosFiltrados.length === 0
                    ? "Nenhuma despesa considerada no acerto para este período."
                    : "Nenhuma despesa corresponde aos filtros das colunas."}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-md">
              <div className="flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-on-surface">
                    Histórico de acertos
                  </h3>
                  <span className="text-on-surface-variant">
                    <IconeHistorico />
                  </span>
                </div>
                {historico.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">
                    Nenhum acerto resolvido ainda.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {historicoVisivel.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-2 border-l-2 border-primary pl-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-on-surface">
                            {nome(a.de.id)} → {nome(a.para.id)} · {nomeMes(a.dataInicio)}
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            Resolvido em {formatarDataCurta(a.resolvidoEm)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm font-semibold text-success">
                            {centavosParaReais(a.valorCentavos)}
                          </span>
                          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                            PAGO
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {historico.length > 3 && (
                  <button
                    onClick={() => setMostrarHistoricoCompleto((v) => !v)}
                    className="rounded-lg border border-outline-variant py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low"
                  >
                    {mostrarHistoricoCompleto
                      ? "Mostrar menos"
                      : "Ver histórico completo"}
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
                <h3 className="text-base font-semibold text-on-surface">
                  Impacto no orçamento
                </h3>
                {resumo.totalPagoPorPessoa.map((t) => {
                  const percentual =
                    totalPagoGeral > 0 ? (t.totalCentavos / totalPagoGeral) * 100 : 0;
                  return (
                    <div key={t.pessoaId} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-on-surface-variant">
                          Gasto {nome(t.pessoaId)}
                        </span>
                        <span className="font-semibold text-on-surface">
                          {percentual.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                        <div
                          className={`h-full rounded-full ${corBarra(t.pessoaId)}`}
                          style={{ width: `${percentual}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {resumo.insight && (
                  <p className="rounded-lg bg-surface-container-low p-sm text-xs text-on-surface-variant">
                    Este período {nome(resumo.insight.pessoaId)} cobriu a
                    maior parte das despesas em {resumo.insight.categoriaNome}.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
