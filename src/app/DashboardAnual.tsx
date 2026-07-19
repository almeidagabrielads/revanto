"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { unicosPorChave, unicosPorId } from "@/lib/dedupe";
import { Select } from "./components/Select";

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

type IndicadorPlanejado = {
  planejadoCentavos: number;
  realCentavos: number;
  diferencaCentavos: number;
  percentual: number | null;
  dentroDoPlanejado: boolean;
};

type LinhaMensalPlanejadoReal = IndicadorPlanejado & { mes: number };

type PlanejadoVsRealCategoria = {
  categoriaId: string;
  subcategoriaId: string | null;
  meses: LinhaMensalPlanejadoReal[];
  acumulado: IndicadorPlanejado;
};

type SecaoPlanejadoVsReal = {
  pessoaId: string;
  tipo: string;
  label: string;
  itens: PlanejadoVsRealCategoria[];
};

type SaldoMensal = {
  mes: number;
  receitaCentavos: number;
  despesaCentavos: number;
  saldoCentavos: number;
};

type SaldoAnual = {
  ano: number;
  receitaCentavos: number;
  despesaCentavos: number;
  saldoCentavos: number;
  porMes: SaldoMensal[];
};

type ResumoCategoria = {
  categoriaId: string;
  totalCentavos: number;
  percentualDoTotal: number;
  mediaMensalCentavos: number;
};

type Transferencia = { deId: string; paraId: string; valorCentavos: number };
type SaldoDivisaoGrupo = {
  participantes: string[];
  transferenciasSugeridas: Transferencia[];
};

type RelatorioAnual = {
  ano: number;
  saldo: SaldoAnual;
  planejadoVsReal: SecaoPlanejadoVsReal[];
  resumoPorCategoria: ResumoCategoria[];
  divisaoDespesas: SaldoDivisaoGrupo | null;
};

type SaldoAnoAnterior = {
  origem: "sistema" | "manual";
  saldoCentavos: number;
} | null;

function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarReaisCompacto(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatarReaisCompactoComSimbolo(centavos: number): string {
  return `R$ ${formatarReaisCompacto(centavos)}`;
}

function mediaMensesConcluidos(
  valoresPorMes: number[],
  mesesConcluidos: number,
): string {
  if (mesesConcluidos === 0) return "—";
  const soma = valoresPorMes
    .slice(0, mesesConcluidos)
    .reduce((total, valor) => total + valor, 0);
  return formatarReaisCompactoComSimbolo(soma / mesesConcluidos);
}

function reaisParaCentavos(valor: string): number {
  const n = Number(valor.replace(",", "."));
  return Math.round(n * 100);
}

function centavosParaReais(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

function chave(categoriaId: string, subcategoriaId: string | null) {
  return `${categoriaId}::${subcategoriaId ?? ""}`;
}

function somarItens(secoes: SecaoPlanejadoVsReal[]) {
  const consolidado = new Map<
    string,
    {
      categoriaId: string;
      subcategoriaId: string | null;
      meses: { planejadoCentavos: number; realCentavos: number }[];
      planejadoAnoCentavos: number;
      realAnoCentavos: number;
    }
  >();

  function entrada(item: PlanejadoVsRealCategoria) {
    const k = chave(item.categoriaId, item.subcategoriaId);
    const atual = consolidado.get(k) ?? {
      categoriaId: item.categoriaId,
      subcategoriaId: item.subcategoriaId,
      meses: Array.from({ length: 12 }, () => ({
        planejadoCentavos: 0,
        realCentavos: 0,
      })),
      planejadoAnoCentavos: 0,
      realAnoCentavos: 0,
    };
    consolidado.set(k, atual);
    return atual;
  }

  // Quando há mais de uma seção (visão "Geral"), soma só as INDIVIDUAL: todo
  // orçamento mora numa pessoa individual, e a fração de cada uma já fecha
  // 100% do gasto real do household — somar as seções de grupo por cima
  // duplicaria (o orçamento/gasto de um grupo já é a soma dos integrantes).
  // Quando há uma única seção (visão filtrada por uma pessoa ou grupo
  // específico), ela já é a resposta, seja indivíduo ou grupo.
  const secoesConsolidadas =
    secoes.length === 1
      ? secoes
      : secoes.filter((s) => s.tipo === "INDIVIDUAL");

  for (const secao of secoesConsolidadas) {
    for (const item of secao.itens) {
      const atual = entrada(item);
      for (const mes of item.meses) {
        atual.meses[mes.mes - 1].planejadoCentavos += mes.planejadoCentavos;
        atual.meses[mes.mes - 1].realCentavos += mes.realCentavos;
      }
      atual.planejadoAnoCentavos += item.acumulado.planejadoCentavos;
      atual.realAnoCentavos += item.acumulado.realCentavos;
    }
  }

  return [...consolidado.values()];
}

export function DashboardAnual({ ano }: { ano: number }) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [relatorio, setRelatorio] = useState<RelatorioAnual | null>(null);
  const [receitaAnoAnterior, setReceitaAnoAnterior] = useState<number | null>(
    null,
  );
  const [saldoAnoAnterior, setSaldoAnoAnterior] =
    useState<SaldoAnoAnterior>(null);
  const [editandoSaldoAnterior, setEditandoSaldoAnterior] = useState(false);
  const [inputSaldoAnterior, setInputSaldoAnterior] = useState("");
  const [salvandoSaldoAnterior, setSalvandoSaldoAnterior] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [naoAutenticado, setNaoAutenticado] = useState(false);
  const [pessoaFiltro, setPessoaFiltro] = useState("");

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
        setCategorias(
          unicosPorId<Categoria>(cats).map((c) => ({
            ...c,
            subcategorias: unicosPorId(c.subcategorias),
          })),
        );
        setPessoas(unicosPorId<Pessoa>(pes));
      })
      .catch(() => {
        if (!cancelado)
          setErro("Não foi possível carregar categorias/pessoas.");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelado = false;
    const pessoaQuery = pessoaFiltro ? `&pessoaId=${pessoaFiltro}` : "";
    Promise.all([
      fetch(`/api/relatorios/anual?ano=${ano}${pessoaQuery}`),
      fetch(`/api/relatorios/saldo?ano=${ano - 1}${pessoaQuery}`),
      fetch(`/api/relatorios/saldo-anterior?ano=${ano}`),
    ])
      .then(async ([relatorioRes, saldoAnteriorRes, saldoAnoAnteriorRes]) => {
        if (cancelado) return;
        if (relatorioRes.status === 401) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        const body = await relatorioRes.json();
        if (!relatorioRes.ok) {
          setErro(body.error ?? "Não foi possível carregar o relatório.");
          setRelatorio(null);
          return;
        }
        setErro(null);
        setRelatorio({
          ...body,
          resumoPorCategoria: unicosPorChave(
            body.resumoPorCategoria,
            (r: ResumoCategoria) => r.categoriaId,
          ),
        });
        setReceitaAnoAnterior(
          saldoAnteriorRes.ok
            ? (await saldoAnteriorRes.json()).receitaCentavos
            : null,
        );
        setSaldoAnoAnterior(
          saldoAnoAnteriorRes.ok ? await saldoAnoAnteriorRes.json() : null,
        );
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar o relatório.");
      });
    return () => {
      cancelado = true;
    };
  }, [ano, reloadToken, pessoaFiltro]);

  async function salvarSaldoAnoAnterior(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoSaldoAnterior(true);
    setErro(null);
    try {
      const response = await fetch("/api/fechamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ano: ano - 1,
          saldoCentavos: reaisParaCentavos(inputSaldoAnterior),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErro(body?.error ?? "Não foi possível salvar o saldo anterior.");
        return;
      }
      setInputSaldoAnterior("");
      setEditandoSaldoAnterior(false);
      setReloadToken((t) => t + 1);
    } finally {
      setSalvandoSaldoAnterior(false);
    }
  }

  function editarSaldoAnoAnterior() {
    setInputSaldoAnterior(
      saldoAnoAnterior ? centavosParaReais(saldoAnoAnterior.saldoCentavos) : "",
    );
    setEditandoSaldoAnterior(true);
  }

  function cancelarEdicaoSaldoAnterior() {
    setInputSaldoAnterior("");
    setEditandoSaldoAnterior(false);
  }

  const nomeCategoria = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of categorias) mapa.set(c.id, c.nome);
    return mapa;
  }, [categorias]);

  const nomeSubcategoria = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of categorias)
      for (const s of c.subcategorias) mapa.set(s.id, s.nome);
    return mapa;
  }, [categorias]);

  const nomePessoa = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of pessoas) mapa.set(p.id, p.nome);
    return mapa;
  }, [pessoas]);

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para ver o relatório anual.
      </p>
    );
  }

  if (!relatorio) {
    return erro ? (
      <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
        {erro}
      </p>
    ) : (
      <p className="text-on-surface-variant text-sm">Carregando…</p>
    );
  }

  const { saldo, resumoPorCategoria, divisaoDespesas } = relatorio;

  const taxaPoupanca =
    saldo.receitaCentavos > 0
      ? (saldo.saldoCentavos / saldo.receitaCentavos) * 100
      : 0;
  const despesaPercentualReceita =
    saldo.receitaCentavos > 0
      ? (saldo.despesaCentavos / saldo.receitaCentavos) * 100
      : 0;
  const variacaoReceita =
    receitaAnoAnterior && receitaAnoAnterior > 0
      ? ((saldo.receitaCentavos - receitaAnoAnterior) / receitaAnoAnterior) *
        100
      : null;
  const saldoAcumulado =
    (saldoAnoAnterior?.saldoCentavos ?? 0) + saldo.saldoCentavos;

  const maioresGastos = [...resumoPorCategoria]
    .sort((a, b) => b.totalCentavos - a.totalCentavos)
    .slice(0, 5);
  const maiorGastoCentavos = maioresGastos[0]?.totalCentavos ?? 1;

  const maxFluxoMensal = Math.max(
    1,
    ...saldo.porMes.flatMap((m) => [m.receitaCentavos, m.despesaCentavos]),
  );

  // Só pessoas INDIVIDUAL — somando as frações de cada uma já se chega a
  // 100% do gasto real (cada uma inclui sua fração dos gastos de grupo), sem
  // contar nada em dobro. Seções de grupo (CASAL/FAMILIA/OUTRO) ficam de fora
  // daqui pelo mesmo motivo que ficam de fora de somarItens.
  const secoesComItens = relatorio.planejadoVsReal.filter(
    (s) => s.tipo === "INDIVIDUAL" && s.itens.length > 0,
  );
  const totalPorSecao = secoesComItens.map((s) => ({
    label: nomePessoa.get(s.pessoaId),
    totalCentavos: s.itens.reduce(
      (soma, i) => soma + i.acumulado.realCentavos,
      0,
    ),
  }));
  const totalGeralSecoes = totalPorSecao.reduce(
    (soma, s) => soma + s.totalCentavos,
    0,
  );

  const itensConsolidados = somarItens(relatorio.planejadoVsReal);
  const totalPlanejadoAno = itensConsolidados.reduce(
    (s, i) => s + i.planejadoAnoCentavos,
    0,
  );
  const totalRealAno = itensConsolidados.reduce(
    (s, i) => s + i.realAnoCentavos,
    0,
  );
  const economiaTotalAno = totalPlanejadoAno - totalRealAno;

  const categoriasComItens = categorias
    .map((c) => ({
      categoria: c,
      itens: itensConsolidados.filter((i) => i.categoriaId === c.id),
    }))
    .filter((c) => c.itens.length > 0);

  const totalConsolidadoPorMes = Array.from({ length: 12 }, (_, mesIdx) =>
    itensConsolidados.reduce(
      (soma, i) => soma + i.meses[mesIdx].realCentavos,
      0,
    ),
  );

  const agora = new Date();
  const mesesConcluidos =
    ano < agora.getFullYear()
      ? 12
      : ano === agora.getFullYear()
        ? agora.getMonth()
        : 0;

  const mesMaisCaro = totalConsolidadoPorMes.reduce(
    (maiorIdx, valor, idx) =>
      valor > totalConsolidadoPorMes[maiorIdx] ? idx : maiorIdx,
    0,
  );
  const mesMaisBarato = totalConsolidadoPorMes.reduce(
    (menorIdx, valor, idx) =>
      valor > 0 &&
      (totalConsolidadoPorMes[menorIdx] === 0 ||
        valor < totalConsolidadoPorMes[menorIdx])
        ? idx
        : menorIdx,
    0,
  );

  const cardClass =
    "flex flex-col gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-lg shadow-sm";

  return (
    <div className="gap-xl flex flex-col">
      {erro && (
        <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
          {erro}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label
            htmlFor="pessoaFiltro"
            className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase"
          >
            Visualizando
          </label>
          <Select
            id="pessoaFiltro"
            value={pessoaFiltro}
            onChange={setPessoaFiltro}
            options={[
              { value: "", label: "Geral" },
              ...pessoas.map((p) => ({ value: p.id, label: p.nome })),
            ]}
          />
        </div>
        <Link
          href="/configuracoes/exportar-dados"
          className="bg-primary px-md py-sm text-on-primary rounded-xl text-sm font-semibold hover:opacity-90"
        >
          Exportar dados
        </Link>
      </div>

      {/* Resumo do ano */}
      <div className="gap-md border-outline-variant bg-surface-container-lowest p-lg grid grid-cols-1 rounded-xl border md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <p className="text-on-surface-variant text-sm">Receita total</p>
          <p className="data-tabular text-on-surface text-2xl font-bold">
            {formatarReais(saldo.receitaCentavos)}
          </p>
          {variacaoReceita !== null && (
            <span
              className={`px-sm w-fit rounded-full py-0.5 text-xs font-semibold ${
                variacaoReceita >= 0
                  ? "bg-success/15 text-success"
                  : "bg-danger-container text-on-danger-container"
              }`}
            >
              {variacaoReceita >= 0 ? "+" : ""}
              {variacaoReceita.toFixed(0)}% vs. {ano - 1}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-on-surface-variant text-sm">Despesas totais</p>
          <p className="data-tabular text-on-surface text-2xl font-bold">
            {formatarReais(saldo.despesaCentavos)}
          </p>
          <span className="text-on-surface-variant text-xs">
            {despesaPercentualReceita.toFixed(0)}% da receita
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-on-surface-variant text-sm">Taxa de poupança</p>
          <p className="data-tabular text-secondary text-2xl font-bold">
            {taxaPoupanca.toFixed(1)}%
          </p>
          <div className="bg-surface-container h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-secondary h-full rounded-full"
              style={{ width: `${Math.min(Math.max(taxaPoupanca, 0), 100)}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-on-surface-variant text-sm">
            Saldo anual até o momento
          </p>
          <p
            className={`data-tabular text-2xl font-bold ${
              saldo.saldoCentavos >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {formatarReais(saldo.saldoCentavos)}
          </p>
          <span className="text-on-surface-variant text-xs">
            Receitas − despesas em {ano}
          </span>
        </div>
      </div>

      {/* Saldo do ano anterior + saldo acumulado */}
      <div className={cardClass}>
        <h2 className="text-on-surface text-xl font-semibold">
          Saldo do ano anterior ({ano - 1})
        </h2>
        {saldoAnoAnterior && !editandoSaldoAnterior ? (
          <div className="gap-md flex flex-wrap items-end justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <p className="data-tabular text-on-surface text-xl font-bold">
                  {formatarReais(saldoAnoAnterior.saldoCentavos)}
                </p>
                <button
                  type="button"
                  onClick={editarSaldoAnoAnterior}
                  title="Editar saldo do ano anterior"
                  aria-label="Editar saldo do ano anterior"
                  className="text-primary hover:bg-primary/10 rounded-full p-1 transition-colors"
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
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    <path d="m15 5 4 4" />
                  </svg>
                </button>
              </div>
              <span className="text-on-surface-variant text-xs">
                {saldoAnoAnterior.origem === "sistema"
                  ? "Calculado a partir dos lançamentos registrados"
                  : "Informado manualmente"}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-right">
              <p className="text-on-surface-variant text-sm">Saldo acumulado</p>
              <p
                className={`data-tabular text-xl font-bold ${
                  saldoAcumulado >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {formatarReais(saldoAcumulado)}
              </p>
            </div>
          </div>
        ) : (
          <form
            onSubmit={salvarSaldoAnoAnterior}
            className="gap-sm flex flex-wrap items-end"
          >
            {!saldoAnoAnterior && (
              <p className="text-on-surface-variant w-full text-sm">
                Nenhum lançamento encontrado para {ano - 1}. Informe o saldo de
                fechamento desse ano para acumular com o saldo de {ano}.
              </p>
            )}
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="saldo-ano-anterior"
              >
                Saldo de fechamento de {ano - 1} (R$)
              </label>
              <input
                id="saldo-ano-anterior"
                type="number"
                step="0.01"
                className="border-outline-variant bg-surface-container-lowest px-sm w-40 rounded-lg border py-1.5 text-sm"
                value={inputSaldoAnterior}
                onChange={(e) => setInputSaldoAnterior(e.target.value)}
                required
                autoFocus={editandoSaldoAnterior}
              />
            </div>
            <button
              type="submit"
              disabled={salvandoSaldoAnterior}
              className="bg-primary px-md text-on-primary rounded-full py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
            >
              Salvar
            </button>
            {saldoAnoAnterior && (
              <button
                type="button"
                onClick={cancelarEdicaoSaldoAnterior}
                className="text-on-surface-variant px-md py-1.5 text-xs font-semibold"
              >
                Cancelar
              </button>
            )}
          </form>
        )}
      </div>

      {/* Fluxo de caixa mensal + Maiores gastos */}
      <div className="gap-md grid grid-cols-1 lg:grid-cols-3">
        <div className={`${cardClass} lg:col-span-2`}>
          <h2 className="text-on-surface text-xl font-semibold">
            Fluxo de caixa mensal
          </h2>
          <div className="flex h-48 items-end gap-2">
            {saldo.porMes.map((m) => {
              const pctReceita = (m.receitaCentavos / maxFluxoMensal) * 100;
              const pctDespesa = (m.despesaCentavos / maxFluxoMensal) * 100;
              return (
                <div
                  key={m.mes}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div className="flex h-32 w-full items-end justify-center gap-0.5">
                    <div className="relative flex h-full w-1/2 items-end">
                      <span
                        className="data-tabular text-on-surface-variant absolute left-1/2 -translate-x-1/2 text-[9px] font-semibold whitespace-nowrap"
                        style={{ bottom: `calc(${pctReceita}% + 2px)` }}
                      >
                        {formatarReaisCompacto(m.receitaCentavos)}
                      </span>
                      <div
                        className="bg-primary w-full rounded-t"
                        style={{ height: `${pctReceita}%` }}
                        title={`Receita: ${formatarReais(m.receitaCentavos)}`}
                      />
                    </div>
                    <div className="relative flex h-full w-1/2 items-end">
                      <span
                        className="data-tabular text-on-surface-variant absolute left-1/2 -translate-x-1/2 text-[9px] font-semibold whitespace-nowrap"
                        style={{ bottom: `calc(${pctDespesa}% + 2px)` }}
                      >
                        {formatarReaisCompacto(m.despesaCentavos)}
                      </span>
                      <div
                        className="bg-outline-variant w-full rounded-t"
                        style={{ height: `${pctDespesa}%` }}
                        title={`Despesa: ${formatarReais(m.despesaCentavos)}`}
                      />
                    </div>
                  </div>
                  <span className="text-on-surface-variant text-[10px] font-medium">
                    {MESES[m.mes - 1].toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="gap-md text-on-surface-variant flex items-center text-xs">
            <span className="flex items-center gap-1">
              <span className="bg-primary h-2.5 w-2.5 rounded-sm" /> Receita
            </span>
            <span className="flex items-center gap-1">
              <span className="bg-outline-variant h-2.5 w-2.5 rounded-sm" />{" "}
              Despesa
            </span>
          </div>
        </div>

        <div className={cardClass}>
          <h2 className="text-on-surface text-xl font-semibold">
            Maiores gastos
          </h2>
          {maioresGastos.length > 0 ? (
            <div className="gap-md flex flex-col">
              {maioresGastos.map((g) => (
                <div key={g.categoriaId} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-on-surface font-medium">
                      {nomeCategoria.get(g.categoriaId) ?? g.categoriaId}
                    </span>
                    <span className="data-tabular text-on-surface-variant">
                      {formatarReais(g.totalCentavos)}
                    </span>
                  </div>
                  <div className="bg-surface-container h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{
                        width: `${(g.totalCentavos / maiorGastoCentavos) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm">
              Nenhum lançamento em {ano}.
            </p>
          )}
        </div>
      </div>

      {/* Análise anual de despesas */}
      <div className="gap-md flex flex-col">
        <div>
          <h2 className="text-on-surface text-3xl font-bold">
            Análise anual de despesas
          </h2>
          <p className="text-on-surface-variant text-sm">
            Média mensal e consolidado de {ano}
          </p>
        </div>

        <div className="gap-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardClass}>
            <p className="text-on-surface-variant text-xs font-semibold uppercase">
              Total anual planejado
            </p>
            <p className="data-tabular text-on-surface text-xl font-bold">
              {formatarReais(totalPlanejadoAno)}
            </p>
            <p className="text-on-surface-variant text-xs">
              Meta: {formatarReaisCompacto(totalPlanejadoAno / 12)}/mês
            </p>
          </div>
          <div className={cardClass}>
            <p className="text-on-surface-variant text-xs font-semibold uppercase">
              Total anual realizado
            </p>
            <p className="data-tabular text-on-surface text-xl font-bold">
              {formatarReais(totalRealAno)}
            </p>
            <p
              className={`text-xs ${economiaTotalAno >= 0 ? "text-success" : "text-danger"}`}
            >
              {totalPlanejadoAno > 0
                ? `${Math.abs(((totalRealAno - totalPlanejadoAno) / totalPlanejadoAno) * 100).toFixed(1)}% ${
                    economiaTotalAno >= 0 ? "abaixo" : "acima"
                  } do planejado`
                : "—"}
            </p>
          </div>
          <div className={cardClass}>
            <p className="text-on-surface-variant text-xs font-semibold uppercase">
              Média mensal de gastos
            </p>
            <p className="data-tabular text-on-surface text-xl font-bold">
              {formatarReais(totalRealAno / 12)}
            </p>
            <p className="text-on-surface-variant text-xs">
              Nos 12 meses de {ano}
            </p>
          </div>
          <div className={cardClass}>
            <p className="text-on-surface-variant text-xs font-semibold uppercase">
              Economia total no ano
            </p>
            <p
              className={`data-tabular text-xl font-bold ${
                economiaTotalAno >= 0 ? "text-secondary" : "text-danger"
              }`}
            >
              {formatarReais(economiaTotalAno)}
            </p>
            <p className="text-on-surface-variant text-xs">
              Planejado − realizado
            </p>
          </div>
        </div>

        <div className="border-outline-variant bg-surface-container-lowest overflow-x-auto rounded-xl border">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-outline-variant text-on-surface-variant border-b text-xs font-semibold tracking-wide uppercase">
                <th className="p-2 text-left">Categoria</th>
                {MESES.map((m) => (
                  <th key={m} className="p-2 text-right">
                    {m}
                  </th>
                ))}
                <th className="border-outline-variant border-l p-2 text-right">
                  Média
                </th>
              </tr>
            </thead>
            <tbody>
              {categoriasComItens.map(({ categoria, itens }) => {
                const subtotalPorMes = Array.from({ length: 12 }, (_, i) =>
                  itens.reduce(
                    (soma, item) => soma + item.meses[i].realCentavos,
                    0,
                  ),
                );
                return (
                  <Fragment key={categoria.id}>
                    <tr className="bg-surface-container-low">
                      <td className="text-on-surface p-2 font-semibold">
                        {categoria.nome}
                      </td>
                      {subtotalPorMes.map((total, idx) => (
                        <td
                          key={idx}
                          className="data-tabular text-on-surface p-2 text-right font-semibold"
                        >
                          {formatarReaisCompactoComSimbolo(total)}
                        </td>
                      ))}
                      <td className="data-tabular text-on-surface border-outline-variant border-l p-2 text-right font-semibold">
                        {mediaMensesConcluidos(subtotalPorMes, mesesConcluidos)}
                      </td>
                    </tr>
                    {itens.map((item) => {
                      const realPorMes = item.meses.map(
                        (mes) => mes.realCentavos,
                      );
                      return (
                        <tr
                          key={chave(item.categoriaId, item.subcategoriaId)}
                          className="border-outline-variant/60 border-b"
                        >
                          <td className="pl-lg text-on-surface-variant p-2">
                            {item.subcategoriaId
                              ? (nomeSubcategoria.get(item.subcategoriaId) ??
                                item.subcategoriaId)
                              : "Geral"}
                          </td>
                          {item.meses.map((mes, idx) => (
                            <td
                              key={idx}
                              className={`data-tabular p-2 text-right ${
                                mes.planejadoCentavos > 0 &&
                                mes.realCentavos > mes.planejadoCentavos
                                  ? "text-danger font-semibold"
                                  : "text-on-surface"
                              }`}
                            >
                              {formatarReaisCompactoComSimbolo(
                                mes.realCentavos,
                              )}
                            </td>
                          ))}
                          <td className="data-tabular text-on-surface-variant border-outline-variant border-l p-2 text-right">
                            {mediaMensesConcluidos(realPorMes, mesesConcluidos)}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
              <tr className="border-outline-variant border-t-2 font-semibold">
                <td className="text-on-surface p-2">Total consolidado</td>
                {totalConsolidadoPorMes.map((total, idx) => (
                  <td
                    key={idx}
                    className="data-tabular text-on-surface p-2 text-right"
                  >
                    {formatarReaisCompactoComSimbolo(total)}
                  </td>
                ))}
                <td className="data-tabular text-on-surface border-outline-variant border-l p-2 text-right">
                  {mediaMensesConcluidos(
                    totalConsolidadoPorMes,
                    mesesConcluidos,
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="gap-md grid grid-cols-1 lg:grid-cols-2">
          <div className={cardClass}>
            <h3 className="text-on-surface text-base font-semibold">
              Distribuição por responsável
            </h3>
            {totalPorSecao.length > 0 && totalGeralSecoes > 0 ? (
              <div className="gap-md flex flex-col">
                {totalPorSecao.map((s) => (
                  <div key={s.label} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-on-surface font-medium">
                        {s.label}
                      </span>
                      <span className="data-tabular text-on-surface-variant">
                        {((s.totalCentavos / totalGeralSecoes) * 100).toFixed(
                          0,
                        )}
                        % ({formatarReais(s.totalCentavos)})
                      </span>
                    </div>
                    <div className="bg-surface-container h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-secondary h-full rounded-full"
                        style={{
                          width: `${(s.totalCentavos / totalGeralSecoes) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-on-surface-variant text-sm">
                Sem lançamentos com pessoa vinculada em {ano}.
              </p>
            )}
            {divisaoDespesas &&
              divisaoDespesas.transferenciasSugeridas.length > 0 && (
                <div className="mt-auto flex flex-col gap-0.5">
                  {divisaoDespesas.transferenciasSugeridas.map((t, i) => (
                    <p key={i} className="text-on-surface-variant text-xs">
                      {nomePessoa.get(t.deId) ?? t.deId} deve{" "}
                      {formatarReais(t.valorCentavos)} para{" "}
                      {nomePessoa.get(t.paraId) ?? t.paraId} para equilibrar o
                      ano.
                    </p>
                  ))}
                </div>
              )}
          </div>

          <div className={cardClass}>
            <h3 className="text-on-surface text-base font-semibold">
              Visão de tendência {ano}
            </h3>
            {totalConsolidadoPorMes.some((v) => v > 0) ? (
              <p className="text-on-surface-variant text-sm">
                O mês com maior gasto consolidado foi{" "}
                <span className="text-on-surface font-semibold">
                  {MESES[mesMaisCaro]}
                </span>{" "}
                ({formatarReais(totalConsolidadoPorMes[mesMaisCaro])}), enquanto{" "}
                <span className="text-on-surface font-semibold">
                  {MESES[mesMaisBarato]}
                </span>{" "}
                teve o menor consolidado (
                {formatarReais(totalConsolidadoPorMes[mesMaisBarato])}).
              </p>
            ) : (
              <p className="text-on-surface-variant text-sm">
                Sem lançamentos com orçamento planejado em {ano}.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Harmonia financeira */}
      <div className="gap-md bg-primary p-lg text-on-primary flex flex-col items-start justify-between rounded-xl sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">Harmonia financeira</h3>
          <p className="text-on-primary/85 text-sm">
            {economiaTotalAno >= 0
              ? `Em ${ano}, vocês economizaram ${formatarReais(economiaTotalAno)} em relação ao planejado, com taxa de poupança de ${taxaPoupanca.toFixed(1)}%. Parabéns pela parceria!`
              : `Em ${ano}, os gastos ficaram ${formatarReais(Math.abs(economiaTotalAno))} acima do planejado. Vale revisar o orçamento juntos.`}
          </p>
        </div>
        <Link
          href="/relatorios"
          className="bg-on-primary/10 px-md py-sm hover:bg-on-primary/20 rounded-xl text-sm font-semibold"
        >
          Ver relatório detalhado
        </Link>
      </div>
    </div>
  );
}
