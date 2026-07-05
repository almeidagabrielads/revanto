"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { unicosPorChave, unicosPorId } from "@/lib/dedupe";

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

const SUBTIPO_LABEL: Record<string, string> = {
  SALARIO: "Salário",
  VOUCHER: "Vale/Voucher",
  OUTROS: "Outros",
};

type Categoria = { id: string; nome: string };
type Pessoa = { id: string; nome: string; tipo: string };

type ResumoCategoria = {
  categoriaId: string;
  totalCentavos: number;
  percentualDoTotal: number;
  mediaMensalCentavos: number;
};

type Receita = { subtipo: string; valorCentavos: number; mes: string };
type PosicaoPatrimonio = { mes: string; valorCentavos: number };
type SaldoMensal = {
  mes: number;
  receitaCentavos: number;
  despesaCentavos: number;
};
type SaldoAnual = { porMes: SaldoMensal[] };
type Lancamento = {
  id: string;
  categoriaId: string | null;
  pessoaDivisaoId: string;
  pessoaPagouId: string;
  valorCentavos: number;
  descontoCentavos: number;
};

function centavosParaReais(valor: number): string {
  return (valor / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function primeiroDiaDoAno(ano: number): string {
  return `${ano}-01-01`;
}

function ultimoDiaDoAno(ano: number): string {
  return `${ano}-12-31`;
}

const TIPOS = [
  {
    id: "categorias",
    titulo: "Gastos por Categoria",
    descricao: "Visualização detalhada de onde o dinheiro está saindo.",
  },
  {
    id: "receitas",
    titulo: "Fontes de Renda",
    descricao: "Acompanhamento de salários e rendimentos extras.",
  },
  {
    id: "patrimonio",
    titulo: "Evolução do Patrimônio",
    descricao: "Crescimento líquido da casa ao longo do ano.",
  },
  {
    id: "fluxo",
    titulo: "Fluxo de Caixa",
    descricao: "Receitas e despesas mensais consolidadas.",
  },
] as const;

type TipoRelatorio = (typeof TIPOS)[number]["id"];

export function RelatoriosClient() {
  const anoAtual = new Date().getUTCFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [tipo, setTipo] = useState<TipoRelatorio>("categorias");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [resumoCategorias, setResumoCategorias] = useState<
    ResumoCategoria[] | null
  >(null);
  const [receitas, setReceitas] = useState<Receita[] | null>(null);
  const [patrimonio, setPatrimonio] = useState<PosicaoPatrimonio[] | null>(
    null,
  );
  const [saldo, setSaldo] = useState<SaldoAnual | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [naoAutenticado, setNaoAutenticado] = useState(false);

  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoAno(anoAtual));
  const [dataFim, setDataFim] = useState(ultimoDiaDoAno(anoAtual));
  const [pessoasSelecionadas, setPessoasSelecionadas] = useState<Set<string>>(
    new Set(),
  );
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("");
  const [resultadoFiltro, setResultadoFiltro] = useState<Lancamento[] | null>(
    null,
  );
  const [gerando, setGerando] = useState(false);

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
        setCategorias(unicosPorId(cats));
        setPessoas(unicosPorId(pes));
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
    Promise.all([
      fetch(`/api/relatorios/resumo-categorias?ano=${ano}`),
      fetch(
        `/api/receitas?mesInicio=${primeiroDiaDoAno(ano)}&mesFim=${ultimoDiaDoAno(ano)}`,
      ),
      fetch(`/api/patrimonio?ano=${ano}`),
      fetch(`/api/relatorios/saldo?ano=${ano}`),
    ])
      .then(async (respostas) => {
        if (cancelado) return;
        const [categoriasRes, receitasRes, patrimonioRes, saldoRes] = respostas;
        if (
          categoriasRes.status === 401 ||
          receitasRes.status === 401 ||
          patrimonioRes.status === 401 ||
          saldoRes.status === 401
        ) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        setResumoCategorias(
          unicosPorChave(
            categoriasRes.ok ? await categoriasRes.json() : [],
            (r: ResumoCategoria) => r.categoriaId,
          ),
        );
        setReceitas(receitasRes.ok ? await receitasRes.json() : []);
        setPatrimonio(patrimonioRes.ok ? await patrimonioRes.json() : []);
        setSaldo(saldoRes.ok ? await saldoRes.json() : null);
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar os relatórios.");
      });
    return () => {
      cancelado = true;
    };
  }, [ano]);

  const nomeCategoria = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of categorias) mapa.set(c.id, c.nome);
    return mapa;
  }, [categorias]);

  function alternarPessoa(id: string) {
    setPessoasSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function gerarRelatorioPersonalizado() {
    setGerando(true);
    setErro(null);
    const query = new URLSearchParams({ dataInicio, dataFim });
    if (categoriaFiltro) query.set("categoriaId", categoriaFiltro);
    if (pessoasSelecionadas.size === 1) {
      query.set("pessoaId", [...pessoasSelecionadas][0]);
    }

    const response = await fetch(`/api/lancamentos?${query.toString()}`);
    setGerando(false);
    if (!response.ok) {
      setErro("Não foi possível gerar o relatório personalizado.");
      return;
    }
    let dados: Lancamento[] = await response.json();
    if (pessoasSelecionadas.size > 1) {
      dados = dados.filter(
        (l) =>
          pessoasSelecionadas.has(l.pessoaDivisaoId) ||
          pessoasSelecionadas.has(l.pessoaPagouId),
      );
    }
    setResultadoFiltro(dados);
  }

  const totalPorCategoriaFiltro = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of resultadoFiltro ?? []) {
      const chave = l.categoriaId ?? "sem-categoria";
      mapa.set(
        chave,
        (mapa.get(chave) ?? 0) + (l.valorCentavos - l.descontoCentavos),
      );
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [resultadoFiltro]);

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para ver os relatórios.
      </p>
    );
  }

  const cardTipoClass = (ativo: boolean) =>
    `flex flex-col gap-1 rounded-xl border p-lg text-left transition-colors ${
      ativo
        ? "border-primary bg-primary text-on-primary"
        : "border-outline-variant bg-surface-container-lowest hover:border-primary"
    }`;

  const totalFiltro = (resultadoFiltro ?? []).reduce(
    (soma, l) => soma + (l.valorCentavos - l.descontoCentavos),
    0,
  );

  return (
    <div className="gap-lg flex flex-col">
      {erro && (
        <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
          {erro}
        </p>
      )}

      <div className="gap-md flex flex-wrap items-end justify-between">
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
        <button
          onClick={() => setFiltrosAbertos((v) => !v)}
          className="border-outline-variant bg-surface-container-lowest px-md py-sm text-on-surface hover:border-primary rounded-xl border text-sm font-semibold"
        >
          {filtrosAbertos ? "Ocultar filtros avançados" : "Filtros avançados"}
        </button>
      </div>

      <div className="gap-md grid grid-cols-1 lg:grid-cols-3">
        <div className="gap-sm flex flex-col lg:col-span-1">
          <h2 className="text-on-surface-variant text-sm font-semibold tracking-wide uppercase">
            Tipos de relatórios
          </h2>
          {TIPOS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTipo(t.id)}
              className={cardTipoClass(tipo === t.id)}
            >
              <h3 className="text-base font-semibold">{t.titulo}</h3>
              <p
                className={`text-sm ${tipo === t.id ? "text-on-primary/80" : "text-on-surface-variant"}`}
              >
                {t.descricao}
              </p>
            </button>
          ))}
        </div>

        <div className="gap-md border-outline-variant bg-surface-container-lowest p-lg flex flex-col rounded-xl border lg:col-span-2">
          <p className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">
            Preview — {TIPOS.find((t) => t.id === tipo)?.titulo} em {ano}
          </p>

          {tipo === "categorias" && (
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-outline-variant text-on-surface-variant border-b text-xs font-semibold tracking-wide uppercase">
                  <th className="p-2 text-left">Categoria</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">% do total</th>
                  <th className="p-2 text-right">Média mensal</th>
                </tr>
              </thead>
              <tbody>
                {resumoCategorias?.map((r) => (
                  <tr
                    key={r.categoriaId}
                    className="border-outline-variant/60 border-b"
                  >
                    <td className="p-2">
                      {nomeCategoria.get(r.categoriaId) ?? "—"}
                    </td>
                    <td className="data-tabular p-2 text-right">
                      {centavosParaReais(r.totalCentavos)}
                    </td>
                    <td className="p-2 text-right">
                      {r.percentualDoTotal.toFixed(1)}%
                    </td>
                    <td className="data-tabular p-2 text-right">
                      {centavosParaReais(r.mediaMensalCentavos)}
                    </td>
                  </tr>
                ))}
                {resumoCategorias?.length === 0 && (
                  <tr>
                    <td className="text-on-surface-variant p-2" colSpan={4}>
                      Nenhum lançamento em {ano}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {tipo === "receitas" && (
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-outline-variant text-on-surface-variant border-b text-xs font-semibold tracking-wide uppercase">
                  <th className="p-2 text-left">Fonte</th>
                  <th className="p-2 text-right">Total no ano</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(
                  (receitas ?? []).reduce<Record<string, number>>((acc, r) => {
                    acc[r.subtipo] = (acc[r.subtipo] ?? 0) + r.valorCentavos;
                    return acc;
                  }, {}),
                ).map(([subtipo, total]) => (
                  <tr
                    key={subtipo}
                    className="border-outline-variant/60 border-b"
                  >
                    <td className="p-2">{SUBTIPO_LABEL[subtipo] ?? subtipo}</td>
                    <td className="data-tabular p-2 text-right">
                      {centavosParaReais(total)}
                    </td>
                  </tr>
                ))}
                {receitas?.length === 0 && (
                  <tr>
                    <td className="text-on-surface-variant p-2" colSpan={2}>
                      Nenhuma receita em {ano}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {tipo === "patrimonio" &&
            (() => {
              const porMes = new Map<string, number>();
              for (const p of patrimonio ?? []) {
                const chave = p.mes.slice(0, 7);
                porMes.set(chave, (porMes.get(chave) ?? 0) + p.valorCentavos);
              }
              const chaves = [...porMes.keys()].sort();
              const max = Math.max(1, ...chaves.map((c) => porMes.get(c) ?? 0));
              return chaves.length > 0 ? (
                <div className="flex h-48 items-end gap-2">
                  {chaves.map((c) => {
                    const valor = porMes.get(c) ?? 0;
                    const mesIdx = Number(c.slice(5, 7)) - 1;
                    return (
                      <div
                        key={c}
                        className="flex flex-1 flex-col items-center gap-1"
                      >
                        <div className="flex h-40 w-full items-end">
                          <div
                            className="bg-primary w-full rounded-t"
                            style={{ height: `${(valor / max) * 100}%` }}
                            title={centavosParaReais(valor)}
                          />
                        </div>
                        <span className="text-on-surface-variant text-[10px] font-medium">
                          {MESES[mesIdx]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-on-surface-variant text-sm">
                  Nenhuma posição de patrimônio lançada em {ano}.
                </p>
              );
            })()}

          {tipo === "fluxo" && (
            <div className="flex h-48 items-end gap-2">
              {(saldo?.porMes ?? []).map((m) => {
                const max = Math.max(
                  1,
                  ...(saldo?.porMes ?? []).flatMap((x) => [
                    x.receitaCentavos,
                    x.despesaCentavos,
                  ]),
                );
                return (
                  <div
                    key={m.mes}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div className="flex h-40 w-full items-end justify-center gap-0.5">
                      <div
                        className="bg-primary w-1/2 rounded-t"
                        style={{
                          height: `${(m.receitaCentavos / max) * 100}%`,
                        }}
                        title={`Receita: ${centavosParaReais(m.receitaCentavos)}`}
                      />
                      <div
                        className="bg-outline-variant w-1/2 rounded-t"
                        style={{
                          height: `${(m.despesaCentavos / max) * 100}%`,
                        }}
                        title={`Despesa: ${centavosParaReais(m.despesaCentavos)}`}
                      />
                    </div>
                    <span className="text-on-surface-variant text-[10px] font-medium">
                      {MESES[m.mes - 1]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {filtrosAbertos && (
        <div className="gap-md border-outline-variant bg-surface-container-lowest p-lg flex flex-col rounded-xl border">
          <h2 className="text-on-surface text-base font-semibold">
            Relatório personalizado
          </h2>
          <div className="gap-lg flex flex-wrap">
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="dataInicio"
              >
                De
              </label>
              <input
                id="dataInicio"
                type="date"
                className="border-outline-variant bg-surface-container-lowest rounded-lg border px-2 py-1"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="dataFim"
              >
                Até
              </label>
              <input
                id="dataFim"
                type="date"
                className="border-outline-variant bg-surface-container-lowest rounded-lg border px-2 py-1"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-on-surface-variant text-xs font-semibold">
                Pessoas
              </span>
              <div className="flex flex-wrap gap-1.5">
                {pessoas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => alternarPessoa(p.id)}
                    className={`px-sm rounded-full border py-1 text-xs font-semibold ${
                      pessoasSelecionadas.has(p.id)
                        ? "border-primary bg-primary text-on-primary"
                        : "border-outline-variant text-on-surface-variant"
                    }`}
                  >
                    {p.nome}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="categoriaFiltro"
              >
                Categoria
              </label>
              <select
                id="categoriaFiltro"
                className="border-outline-variant bg-surface-container-lowest rounded-lg border px-2 py-1"
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value)}
              >
                <option value="">Todas as categorias</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={gerarRelatorioPersonalizado}
              disabled={gerando}
              className="bg-primary px-md py-sm text-on-primary self-end rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {gerando ? "Gerando…" : "Gerar relatório"}
            </button>
          </div>

          {resultadoFiltro && (
            <div className="gap-sm border-outline-variant pt-md flex flex-col border-t">
              <p className="text-on-surface-variant text-sm">
                {resultadoFiltro.length} lançamento(s) — total de{" "}
                <span className="text-on-surface font-semibold">
                  {centavosParaReais(totalFiltro)}
                </span>
              </p>
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-outline-variant text-on-surface-variant border-b text-xs font-semibold tracking-wide uppercase">
                    <th className="p-2 text-left">Categoria</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {totalPorCategoriaFiltro.map(([categoriaId, total]) => (
                    <tr
                      key={categoriaId}
                      className="border-outline-variant/60 border-b"
                    >
                      <td className="p-2">
                        {categoriaId === "sem-categoria"
                          ? "Sem categoria"
                          : (nomeCategoria.get(categoriaId) ?? "—")}
                      </td>
                      <td className="data-tabular p-2 text-right">
                        {centavosParaReais(total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <section className="gap-sm flex flex-col">
        <h2 className="text-on-surface-variant text-sm font-semibold tracking-wide uppercase">
          Relatórios completos
        </h2>
        <div className="gap-md grid grid-cols-1 sm:grid-cols-3">
          <Link
            href="/"
            className="border-outline-variant bg-surface-container-lowest p-lg hover:border-primary flex flex-col gap-1 rounded-xl border transition-colors"
          >
            <h3 className="text-on-surface text-base font-semibold">
              Visão anual
            </h3>
            <p className="text-on-surface-variant text-sm">
              Saldo, planejado vs. real, evolução patrimonial e acerto de contas
              do ano — alterne para &ldquo;Anual&rdquo; no Dashboard.
            </p>
          </Link>
          <Link
            href="/divisao"
            className="border-outline-variant bg-surface-container-lowest p-lg hover:border-primary flex flex-col gap-1 rounded-xl border transition-colors"
          >
            <h3 className="text-on-surface text-base font-semibold">
              Acerto de contas
            </h3>
            <p className="text-on-surface-variant text-sm">
              Quem deve quem no período selecionado.
            </p>
          </Link>
          <Link
            href="/orcamento"
            className="border-outline-variant bg-surface-container-lowest p-lg hover:border-primary flex flex-col gap-1 rounded-xl border transition-colors"
          >
            <h3 className="text-on-surface text-base font-semibold">
              Planejamento vs. real
            </h3>
            <p className="text-on-surface-variant text-sm">
              Orçamento planejado por categoria e mês.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
