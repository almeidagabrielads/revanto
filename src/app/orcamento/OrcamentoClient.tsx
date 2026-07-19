"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { unicosPorChave, unicosPorId } from "@/lib/dedupe";
import { gerarInsightMensal } from "@/lib/domain/insightsOrcamento";
import {
  calcularSaldoComprometido,
  gerarInsightComprometido,
  type ParcelamentoParaComprometido,
} from "@/lib/domain/comprometido";
import { Select } from "../components/Select";

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

const MESES_LONGOS = [
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

type Subcategoria = {
  id: string;
  nome: string;
  categoriaId: string;
  ativo: boolean;
};
type Categoria = {
  id: string;
  nome: string;
  ativo: boolean;
  subcategorias: Subcategoria[];
};
type Pessoa = { id: string; nome: string; tipo: string };
type OrcamentoItem = {
  id: string;
  pessoaId: string | null;
  divisaoId: string | null;
  categoriaId: string;
  subcategoriaId: string | null;
  mes: number | null;
  ano: number;
  valorCentavos: number;
  tipoGasto: string;
};

const TIPOS_GASTO = [
  { value: "FIXO", label: "Fixo" },
  { value: "VARIAVEL", label: "Variável" },
  { value: "INVESTIMENTO", label: "Investimento" },
] as const;

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

// "" = Total (casa toda): soma de todas as pessoas INDIVIDUAL, somente leitura.
const TOTAL_CASA = "";

type Aba = "mes" | "anual";

async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível completar a operação.";
}

function centavosParaReais(valor: number): string {
  return (valor / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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

function chaveCategoria(categoriaId: string, subcategoriaId: string | null) {
  return `${categoriaId}::${subcategoriaId ?? ""}`;
}

// Agrupa os itens de orçamento por categoria/subcategoria, ordenados por mês
// (mes ausente = vigente desde o mês 1). Usado para achar a divisão/tipo de
// gasto vigentes num mês sem entrada própria — mesmo princípio do valor
// vigente (ver relatorios.ts), calculado no cliente porque divisão e tipo de
// gasto não são numéricos e não passam pelo relatório planejado vs. real.
function agruparPorSubcategoria(
  itens: OrcamentoItem[],
): Map<string, OrcamentoItem[]> {
  const mapa = new Map<string, OrcamentoItem[]>();
  for (const item of itens) {
    const k = chaveCategoria(item.categoriaId, item.subcategoriaId);
    const lista = mapa.get(k) ?? [];
    lista.push(item);
    mapa.set(k, lista);
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => (a.mes ?? 1) - (b.mes ?? 1));
  }
  return mapa;
}

function vigenteExtra(
  itensDaSubcategoria: OrcamentoItem[] | undefined,
  mes: number,
): { divisaoId: string | null; tipoGasto: string } {
  let vigente: OrcamentoItem | undefined;
  for (const item of itensDaSubcategoria ?? []) {
    if ((item.mes ?? 1) <= mes) vigente = item;
  }
  return {
    divisaoId: vigente?.divisaoId ?? null,
    tipoGasto: vigente?.tipoGasto ?? "VARIAVEL",
  };
}

// A API já filtra categorias inativas por padrão, mas não filtra
// subcategorias inativas dentro de uma categoria ativa.
function somenteAtivas(categorias: Categoria[]): Categoria[] {
  return categorias
    .filter((c) => c.ativo)
    .map((c) => ({
      ...c,
      subcategorias: c.subcategorias.filter((s) => s.ativo),
    }));
}

function deslocarMes(
  ano: number,
  mes: number,
  delta: number,
): { ano: number; mes: number } {
  const total = (ano * 12 + (mes - 1) + delta + 12_000) % 12; // guarda contra negativos
  const anoBase = ano + Math.floor((mes - 1 + delta) / 12);
  return { ano: anoBase, mes: total + 1 };
}

export function OrcamentoClient() {
  const hoje = new Date();
  const anoAtual = hoje.getUTCFullYear();
  const mesAtual = hoje.getUTCMonth() + 1;

  const [aba, setAba] = useState<Aba>("mes");
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(mesAtual);
  const [pessoaFiltro, setPessoaFiltro] = useState<string>(TOTAL_CASA);
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [naoAutenticado, setNaoAutenticado] = useState(false);

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
        setCategorias(somenteAtivas(unicosPorId(cats)));
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

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para gerenciar o orçamento.
      </p>
    );
  }

  const pessoaSelecionada = pessoas.find((p) => p.id === pessoaFiltro);
  const editavel =
    pessoaFiltro !== TOTAL_CASA && pessoaSelecionada?.tipo === "INDIVIDUAL";

  const abaClass = (ativo: boolean) =>
    `px-md py-sm text-sm font-semibold border-b-2 transition-colors ${
      ativo
        ? "border-primary text-primary"
        : "border-transparent text-on-surface-variant hover:text-primary"
    }`;

  return (
    <div className="gap-lg flex flex-col">
      {erro && (
        <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
          {erro}
        </p>
      )}

      {aba !== "mes" && (
        <h1 className="text-on-surface text-4xl font-bold">Orçamento</h1>
      )}

      <div className="border-outline-variant flex gap-1 border-b">
        <button
          className={abaClass(aba === "mes")}
          onClick={() => setAba("mes")}
        >
          Mês Atual
        </button>
        <button
          className={abaClass(aba === "anual")}
          onClick={() => setAba("anual")}
        >
          Visão Anual
        </button>
      </div>

      <div className="gap-md flex flex-wrap items-end justify-between">
        <div className="flex flex-col gap-1">
          <label
            className="text-on-surface-variant text-xs font-semibold"
            htmlFor="pessoa"
          >
            Pessoa/grupo
          </label>
          <Select
            id="pessoa"
            value={pessoaFiltro}
            onChange={setPessoaFiltro}
            options={[
              { value: TOTAL_CASA, label: "Total (casa toda)" },
              ...pessoas.map((p) => ({ value: p.id, label: p.nome })),
            ]}
          />
          {!editavel && (
            <span className="text-on-surface-variant text-xs">
              Somatório dos integrantes — somente leitura. Selecione uma pessoa
              para editar.
            </span>
          )}
        </div>

        {aba === "mes" && (
          <div className="gap-sm flex items-center">
            <button
              aria-label="Mês anterior"
              className="border-outline-variant text-on-surface-variant hover:border-primary flex h-8 w-8 items-center justify-center rounded-full border"
              onClick={() => {
                const d = deslocarMes(ano, mes, -1);
                setAno(d.ano);
                setMes(d.mes);
              }}
            >
              ‹
            </button>
            <div className="border-outline-variant bg-surface-container-lowest flex overflow-hidden rounded-full border p-0.5">
              <span className="bg-primary text-on-primary px-md rounded-full py-1.5 text-sm font-semibold">
                {MESES_LONGOS[mes - 1]} {ano}
              </span>
              <button
                className="text-on-surface-variant hover:text-primary px-md py-1.5 text-sm font-medium"
                onClick={() => {
                  const d = deslocarMes(ano, mes, 1);
                  setAno(d.ano);
                  setMes(d.mes);
                }}
              >
                {(() => {
                  const d = deslocarMes(ano, mes, 1);
                  return `${MESES_LONGOS[d.mes - 1]} ${d.ano}`;
                })()}
              </button>
            </div>
            <button
              aria-label="Próximo mês"
              className="border-outline-variant text-on-surface-variant hover:border-primary flex h-8 w-8 items-center justify-center rounded-full border"
              onClick={() => {
                const d = deslocarMes(ano, mes, 1);
                setAno(d.ano);
                setMes(d.mes);
              }}
            >
              ›
            </button>
          </div>
        )}

        {aba === "anual" && (
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
        )}
      </div>

      {aba === "mes" && (
        <VisaoMesAtual
          ano={ano}
          mes={mes}
          pessoaFiltro={pessoaFiltro}
          editavel={!!editavel}
          categorias={categorias}
          pessoas={pessoas}
          setErro={setErro}
        />
      )}
      {aba === "anual" && (
        <VisaoAnual
          ano={ano}
          pessoaFiltro={pessoaFiltro}
          editavel={!!editavel}
          categorias={categorias}
          pessoas={pessoas}
          setErro={setErro}
        />
      )}
    </div>
  );
}

function IconeCalendario() {
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
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconeBanco() {
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
      <path d="M3 21h18M3 10h18M5 6l7-4 7 4M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
    </svg>
  );
}

function IconeTendencia({ positiva }: { positiva: boolean }) {
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
      {positiva ? (
        <path d="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6" />
      ) : (
        <path d="M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6" />
      )}
    </svg>
  );
}

function VisaoMesAtual({
  ano,
  mes,
  pessoaFiltro,
  editavel,
  categorias,
  pessoas,
  setErro,
}: {
  ano: number;
  mes: number;
  pessoaFiltro: string;
  editavel: boolean;
  categorias: Categoria[] | null;
  pessoas: Pessoa[];
  setErro: (msg: string | null) => void;
}) {
  const [dados, setDados] = useState<PlanejadoVsRealCategoria[] | null>(null);
  const [orcamentosRaw, setOrcamentosRaw] = useState<OrcamentoItem[] | null>(
    null,
  );
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [reloadToken, setReloadToken] = useState(0);
  const [parcelamentosGradual, setParcelamentosGradual] = useState<
    ParcelamentoParaComprometido[]
  >([]);

  function recarregar() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    let cancelado = false;
    type ParcelamentoApi = {
      modo: "GRADUAL" | "AVISTA" | "PREVISAO";
      quitadoEm: string | null;
      valorTotalCentavos: number;
      quantidadeParcelas: number;
      dataPrimeiraParcela: string;
      lancamentos: { numeroParcela: number | null }[];
    };
    fetch("/api/parcelamentos")
      .then((r) => (r.ok ? r.json() : null))
      .then((lista: ParcelamentoApi[] | null) => {
        if (cancelado || !lista) return;
        setParcelamentosGradual(
          lista
            .filter((p) => p.modo === "GRADUAL")
            .map((p) => ({
              modo: p.modo,
              quitadoEm: p.quitadoEm ? new Date(p.quitadoEm) : null,
              valorTotalCentavos: p.valorTotalCentavos,
              quantidadeParcelas: p.quantidadeParcelas,
              dataPrimeiraParcela: new Date(p.dataPrimeiraParcela),
              numerosParcelaLancados: p.lancamentos.map((l) => l.numeroParcela),
            })),
        );
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    let cancelado = false;
    const pessoaQuery = pessoaFiltro === "" ? "" : `&pessoaId=${pessoaFiltro}`;
    fetch(`/api/relatorios/planejado-vs-real?ano=${ano}${pessoaQuery}`)
      .then(async (response) => {
        if (cancelado) return;
        if (!response.ok) {
          if (response.status !== 401) {
            setErro("Não foi possível carregar o planejado vs. real.");
          }
          return;
        }
        setDados(
          unicosPorChave(await response.json(), (r: PlanejadoVsRealCategoria) =>
            chaveCategoria(r.categoriaId, r.subcategoriaId),
          ),
        );
      })
      .catch(() => {
        if (!cancelado)
          setErro("Não foi possível carregar o planejado vs. real.");
      });
    return () => {
      cancelado = true;
    };
  }, [ano, pessoaFiltro, reloadToken, setErro]);

  useEffect(() => {
    let cancelado = false;
    const pessoaQuery = pessoaFiltro === "" ? "" : `&pessoaId=${pessoaFiltro}`;
    fetch(`/api/orcamentos?ano=${ano}${pessoaQuery}`)
      .then(async (response) => {
        if (cancelado) return;
        if (!response.ok) {
          if (response.status !== 401)
            setErro("Não foi possível carregar o orçamento.");
          return;
        }
        setOrcamentosRaw(await response.json());
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar o orçamento.");
      });
    return () => {
      cancelado = true;
    };
  }, [ano, pessoaFiltro, reloadToken, setErro]);

  const mapaOrcamentosRaw = useMemo(() => {
    const mapa = new Map<string, OrcamentoItem>();
    for (const o of orcamentosRaw ?? []) {
      mapa.set(chave(o.categoriaId, o.subcategoriaId, o.mes), o);
    }
    return mapa;
  }, [orcamentosRaw]);

  const itensPorSubcategoria = useMemo(
    () => agruparPorSubcategoria(orcamentosRaw ?? []),
    [orcamentosRaw],
  );

  async function salvarPlanejadoSubcategoria(
    categoriaId: string,
    subcategoriaId: string,
    valorTexto: string,
    divisaoIdSelecionada: string | null,
    tipoGastoSelecionado: string,
    valorExibidoAntesCentavos: number,
    divisaoIdAntes: string | null,
    tipoGastoAntes: string,
  ) {
    setErro(null);
    const existente = mapaOrcamentosRaw.get(
      chave(categoriaId, subcategoriaId, mes),
    );
    const valorCentavos =
      valorTexto.trim() === "" ? 0 : reaisParaCentavos(valorTexto);

    // Sem edição real: os três campos só exibiam o que já está vigente (mês
    // anterior ou limite sugerido da subcategoria), nada foi de fato
    // alterado.
    if (
      !existente &&
      valorCentavos === valorExibidoAntesCentavos &&
      divisaoIdSelecionada === divisaoIdAntes &&
      tipoGastoSelecionado === tipoGastoAntes
    ) {
      return;
    }

    // Campo de valor limpo (voltar a herdar o vigente): remove a entrada
    // específica deste mês, se houver — divisão/tipo do mês somem junto.
    if (existente && valorTexto.trim() === "") {
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
      if (
        existente.valorCentavos === valorCentavos &&
        existente.divisaoId === divisaoIdSelecionada &&
        existente.tipoGasto === tipoGastoSelecionado
      ) {
        return;
      }
      const response = await fetch(`/api/orcamentos/${existente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valorCentavos,
          divisaoId: divisaoIdSelecionada,
          tipoGasto: tipoGastoSelecionado,
        }),
      });
      if (!response.ok) {
        setErro(await parseErro(response));
        return;
      }
      recarregar();
      return;
    }

    // Novo valor a partir deste mês, inclusive zero (override explícito que
    // suprime o valor vigente/limite sugerido para este mês em diante).
    const response = await fetch("/api/orcamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pessoaId: pessoaFiltro,
        categoriaId,
        subcategoriaId,
        mes,
        ano,
        valorCentavos,
        divisaoId: divisaoIdSelecionada,
        tipoGasto: tipoGastoSelecionado,
      }),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    recarregar();
  }

  const mapaDados = useMemo(() => {
    const mapa = new Map<string, LinhaMensalPlanejadoReal>();
    for (const c of dados ?? []) {
      const linha = c.meses.find((m) => m.mes === mes);
      if (linha)
        mapa.set(chaveCategoria(c.categoriaId, c.subcategoriaId), linha);
    }
    return mapa;
  }, [dados, mes]);

  function indicador(
    categoriaId: string,
    subcategoriaId: string | null,
  ): IndicadorPlanejado {
    return (
      mapaDados.get(chaveCategoria(categoriaId, subcategoriaId)) ?? {
        planejadoCentavos: 0,
        realCentavos: 0,
        diferencaCentavos: 0,
        percentual: null,
        dentroDoPlanejado: true,
      }
    );
  }

  function indicadorCategoria(categoria: Categoria): IndicadorPlanejado {
    const proprio = indicador(categoria.id, null);
    return categoria.subcategorias.reduce(
      (acc, sub) => {
        const ind = indicador(categoria.id, sub.id);
        return {
          planejadoCentavos: acc.planejadoCentavos + ind.planejadoCentavos,
          realCentavos: acc.realCentavos + ind.realCentavos,
          diferencaCentavos: 0,
          percentual: null,
          dentroDoPlanejado: true,
        };
      },
      {
        ...proprio,
        diferencaCentavos: 0,
        percentual: null,
        dentroDoPlanejado: true,
      },
    );
  }

  const linhasCategorias = (categorias ?? []).map((c) => ({
    categoria: c,
    indicador: indicadorCategoria(c),
  }));

  const totalPlanejado = linhasCategorias.reduce(
    (s, l) => s + l.indicador.planejadoCentavos,
    0,
  );
  const totalReal = linhasCategorias.reduce(
    (s, l) => s + l.indicador.realCentavos,
    0,
  );
  const saldo = totalPlanejado - totalReal;
  const usoPercentual =
    totalPlanejado > 0
      ? Math.min((totalReal / totalPlanejado) * 100, 100)
      : totalReal > 0
        ? 100
        : 0;
  const dentroDoPlanejado = totalReal <= totalPlanejado;

  const top5 = [...linhasCategorias]
    .filter((l) => l.indicador.realCentavos > 0)
    .sort((a, b) => b.indicador.realCentavos - a.indicador.realCentavos)
    .slice(0, 5);
  const maxTop5 = Math.max(1, ...top5.map((l) => l.indicador.realCentavos));

  const insight = gerarInsightMensal(
    linhasCategorias.map((l) => ({
      nome: l.categoria.nome,
      planejadoCentavos: l.indicador.planejadoCentavos,
      realCentavos: l.indicador.realCentavos,
    })),
  );

  const saldoComprometido = calcularSaldoComprometido(parcelamentosGradual);
  const insightComprometido = gerarInsightComprometido(
    saldoComprometido.totalComprometidoCentavos,
  );

  function alternar(categoriaId: string) {
    setAbertas((atual) => {
      const novo = new Set(atual);
      if (novo.has(categoriaId)) novo.delete(categoriaId);
      else novo.add(categoriaId);
      return novo;
    });
  }

  const cardClass =
    "flex flex-col justify-between gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg shadow-sm";

  return (
    <div className="gap-lg flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-on-surface text-4xl font-bold">
            Planejamento vs. Real
          </h1>
          <p className="text-on-surface-variant text-sm">
            Acompanhamento detalhado do orçamento doméstico em{" "}
            {MESES_LONGOS[mes - 1]} {ano}.
          </p>
        </div>
        <Link
          href="/lancamentos"
          className="bg-primary px-md text-on-primary flex items-center gap-1.5 rounded-full py-2 text-sm font-semibold hover:opacity-90"
        >
          <span className="text-base leading-none">+</span> Nova transação
        </Link>
      </div>

      <div className="gap-md grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">
              Planejado
            </span>
            <span className="text-on-surface-variant">
              <IconeCalendario />
            </span>
          </div>
          <div>
            <p className="text-on-surface-variant text-xs">Total mensal</p>
            <p className="data-tabular text-on-surface text-2xl font-semibold">
              {centavosParaReais(totalPlanejado)}
            </p>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">
              Realizado
            </span>
            <span className="text-on-surface-variant">
              <IconeBanco />
            </span>
          </div>
          <div>
            <p className="text-on-surface-variant text-xs">Gastos até agora</p>
            <p className="data-tabular text-on-surface text-2xl font-semibold">
              {centavosParaReais(totalReal)}
            </p>
          </div>
        </div>

        <div
          className={`${cardClass} border-l-4 ${
            dentroDoPlanejado ? "border-l-success" : "border-l-danger"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">
              Diferença
            </span>
            <span
              className={dentroDoPlanejado ? "text-success" : "text-danger"}
            >
              <IconeTendencia positiva={dentroDoPlanejado} />
            </span>
          </div>
          <div>
            <p className="text-on-surface-variant text-xs">Saldo disponível</p>
            <p
              className={`data-tabular text-2xl font-semibold ${
                dentroDoPlanejado ? "text-success" : "text-danger"
              }`}
            >
              {centavosParaReais(saldo)}
            </p>
          </div>
        </div>

        <div className={cardClass}>
          <span className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">
            Tendência Top 5
          </span>
          {top5.length > 0 ? (
            <div className="flex h-16 items-end gap-2">
              {top5.map((l) => (
                <div
                  key={l.categoria.id}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={centavosParaReais(l.indicador.realCentavos)}
                >
                  <div className="flex h-10 w-full items-end">
                    <div
                      className="bg-primary w-full rounded-t"
                      style={{
                        height: `${(l.indicador.realCentavos / maxTop5) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-on-surface-variant truncate text-[10px] font-medium">
                    {l.categoria.nome.slice(0, 8)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm">
              Sem gastos registrados ainda.
            </p>
          )}
        </div>
      </div>

      <div className="border-outline-variant bg-surface-container-lowest overflow-x-auto rounded-xl border">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-outline-variant text-on-surface-variant border-b text-xs font-semibold tracking-wide uppercase">
              <th className="p-3 text-left">Categoria / Subcategoria</th>
              <th className="p-3 text-left">Divisão</th>
              <th className="p-3 text-left">Tipo de gasto</th>
              <th className="p-3 text-right">Planejado (R$)</th>
              <th className="p-3 text-right">Real (R$)</th>
              <th className="p-3 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {linhasCategorias.map(({ categoria, indicador: indCategoria }) => {
              const aberta = abertas.has(categoria.id);
              const temSub = categoria.subcategorias.length > 0;
              return (
                <Fragment key={categoria.id}>
                  <LinhaMes
                    label={categoria.nome}
                    indicador={indCategoria}
                    destaque
                    expansivel={temSub}
                    aberta={aberta}
                    onToggle={() => alternar(categoria.id)}
                  />
                  {aberta &&
                    categoria.subcategorias.map((sub) => {
                      const itemRaw = mapaOrcamentosRaw.get(
                        chave(categoria.id, sub.id, mes),
                      );
                      const indSub = indicador(categoria.id, sub.id);
                      // Sem entrada específica do mês: mostra o valor rateado
                      // do orçamento anual, se houver, para não parecer vazio.
                      const valorExibidoCentavos =
                        itemRaw?.valorCentavos ??
                        (indSub.planejadoCentavos > 0
                          ? indSub.planejadoCentavos
                          : 0);
                      const extraVigente = vigenteExtra(
                        itensPorSubcategoria.get(
                          chaveCategoria(categoria.id, sub.id),
                        ),
                        mes,
                      );
                      const divisaoExibida =
                        itemRaw?.divisaoId ?? extraVigente.divisaoId;
                      const tipoExibido =
                        itemRaw?.tipoGasto ?? extraVigente.tipoGasto;
                      return (
                        <LinhaMes
                          key={sub.id}
                          label={sub.nome}
                          indicador={indSub}
                          planejadoEditavel={
                            editavel
                              ? {
                                  valorCentavos: valorExibidoCentavos,
                                  itemId: itemRaw?.id,
                                  divisaoId: divisaoExibida,
                                  tipoGasto: tipoExibido,
                                  pessoas,
                                  onSalvar: (texto, divisaoId, tipoGasto) =>
                                    salvarPlanejadoSubcategoria(
                                      categoria.id,
                                      sub.id,
                                      texto,
                                      divisaoId,
                                      tipoGasto,
                                      valorExibidoCentavos,
                                      divisaoExibida,
                                      tipoExibido,
                                    ),
                                }
                              : undefined
                          }
                        />
                      );
                    })}
                </Fragment>
              );
            })}
            <tr className="bg-surface-container-low font-semibold">
              <td className="p-3">Total consolidado</td>
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td className="data-tabular p-3 text-right">
                {centavosParaReais(totalPlanejado)}
              </td>
              <td className="data-tabular p-3 text-right">
                {centavosParaReais(totalReal)}
              </td>
              <td
                className={`data-tabular p-3 text-right ${
                  saldo < 0 ? "text-danger" : "text-success"
                }`}
              >
                {centavosParaReais(Math.abs(saldo))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {categorias?.length === 0 && (
        <p className="text-on-surface-variant text-sm">
          Nenhuma categoria cadastrada — crie categorias antes de definir o
          orçamento.
        </p>
      )}

      <div className="gap-lg grid grid-cols-1 lg:grid-cols-2">
        <div className={cardClass}>
          <h2 className="text-on-surface flex items-center gap-2 text-xl font-semibold">
            ✨ Insights do mês
          </h2>
          <p className="text-on-surface-variant text-sm">
            {insight ?? "Ainda não há dados suficientes para gerar um insight."}
          </p>
        </div>

        <div className={`${cardClass} flex-row items-center justify-between`}>
          <div>
            <p className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">
              Uso do orçamento do mês
            </p>
            <p className="data-tabular text-on-surface text-2xl font-semibold">
              {centavosParaReais(totalReal)}{" "}
              <span className="text-on-surface-variant text-sm font-normal">
                / {centavosParaReais(totalPlanejado)}
              </span>
            </p>
          </div>
          <AnelProgresso
            percentual={usoPercentual}
            cor={dentroDoPlanejado ? "success" : "danger"}
          />
        </div>

        {insightComprometido && (
          <div className={cardClass}>
            <h2 className="text-on-surface flex items-center gap-2 text-xl font-semibold">
              📌 Saldo comprometido
            </h2>
            <p className="text-on-surface-variant text-sm">
              {insightComprometido}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AnelProgresso({
  percentual,
  cor,
}: {
  percentual: number;
  cor: "success" | "danger";
}) {
  const raio = 34;
  const circunferencia = 2 * Math.PI * raio;
  const offset = circunferencia * (1 - percentual / 100);
  const corClasse = cor === "success" ? "text-success" : "text-danger";
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
      <circle
        cx="40"
        cy="40"
        r={raio}
        strokeWidth="8"
        fill="none"
        className="text-surface-container"
        stroke="currentColor"
      />
      <circle
        cx="40"
        cy="40"
        r={raio}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circunferencia}
        strokeDashoffset={offset}
        className={corClasse}
        stroke="currentColor"
      />
      <text
        x="40"
        y="40"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-on-surface rotate-90"
        style={{
          transformOrigin: "40px 40px",
          fontSize: "16px",
          fontWeight: 700,
        }}
      >
        {Math.round(percentual)}%
      </text>
    </svg>
  );
}

// Uma "célula" de orçamento editável: valor + divisão + tipo de gasto,
// sempre salvos juntos (mudar qualquer um dos três grava a linha do mês com
// o estado atual dos outros dois) — evita salvar um campo sem os outros.
// Usado tanto pela aba Mês Atual (uma célula por subcategoria) quanto pela
// Visão Anual (uma célula por mês por subcategoria).
function CampoOrcamento({
  valorCentavos,
  temRegistro,
  divisaoId,
  tipoGasto,
  pessoas,
  onSalvar,
}: {
  valorCentavos: number;
  temRegistro: boolean;
  divisaoId: string | null;
  tipoGasto: string;
  pessoas: Pessoa[];
  onSalvar: (
    valorTexto: string,
    divisaoId: string | null,
    tipoGasto: string,
  ) => void;
}) {
  const [valorTexto, setValorTexto] = useState(
    valorCentavos > 0 || temRegistro ? (valorCentavos / 100).toFixed(2) : "",
  );
  const [divisaoSelecionada, setDivisaoSelecionada] = useState(divisaoId ?? "");
  const [tipoSelecionado, setTipoSelecionado] = useState(tipoGasto);

  return (
    <>
      <td className="p-1">
        <Select
          value={divisaoSelecionada}
          onChange={(v) => {
            setDivisaoSelecionada(v);
            onSalvar(valorTexto, v || null, tipoSelecionado);
          }}
          placeholder="Divisão"
          className="w-full text-xs"
          options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
        />
      </td>
      <td className="p-1">
        <Select
          value={tipoSelecionado}
          onChange={(v) => {
            setTipoSelecionado(v);
            onSalvar(valorTexto, divisaoSelecionada || null, v);
          }}
          placeholder="Tipo de gasto"
          className="w-full text-xs"
          options={TIPOS_GASTO.map((t) => ({ value: t.value, label: t.label }))}
        />
      </td>
      <td className="p-1 text-right">
        <input
          type="number"
          step="0.01"
          value={valorTexto}
          onChange={(e) => setValorTexto(e.target.value)}
          onBlur={() =>
            onSalvar(valorTexto, divisaoSelecionada || null, tipoSelecionado)
          }
          className="border-outline-variant bg-surface-container-lowest data-tabular w-24 rounded-lg border px-1.5 py-1 text-right"
        />
      </td>
    </>
  );
}

// Versão compacta de CampoOrcamento: os três controles (valor, divisão, tipo
// de gasto) empilhados numa única célula — usada na Visão Anual, onde cada
// mês já é uma coluna e não caberiam 3 colunas a mais por mês.
function CampoOrcamentoCompacto({
  valorCentavos,
  temRegistro,
  divisaoId,
  tipoGasto,
  pessoas,
  onSalvar,
}: {
  valorCentavos: number;
  temRegistro: boolean;
  divisaoId: string | null;
  tipoGasto: string;
  pessoas: Pessoa[];
  onSalvar: (
    valorTexto: string,
    divisaoId: string | null,
    tipoGasto: string,
  ) => void;
}) {
  const [valorTexto, setValorTexto] = useState(
    valorCentavos > 0 || temRegistro ? (valorCentavos / 100).toFixed(2) : "",
  );
  const [divisaoSelecionada, setDivisaoSelecionada] = useState(divisaoId ?? "");
  const [tipoSelecionado, setTipoSelecionado] = useState(tipoGasto);

  return (
    <div className="flex flex-col items-stretch gap-1">
      <input
        type="number"
        step="0.01"
        value={valorTexto}
        onChange={(e) => setValorTexto(e.target.value)}
        onBlur={() =>
          onSalvar(valorTexto, divisaoSelecionada || null, tipoSelecionado)
        }
        className="border-outline-variant bg-surface-container-lowest data-tabular w-28 rounded-lg border px-1.5 py-1 text-right"
      />
      <Select
        value={divisaoSelecionada}
        onChange={(v) => {
          setDivisaoSelecionada(v);
          onSalvar(valorTexto, v || null, tipoSelecionado);
        }}
        placeholder="Divisão"
        className="w-28 text-xs"
        options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
      />
      <Select
        value={tipoSelecionado}
        onChange={(v) => {
          setTipoSelecionado(v);
          onSalvar(valorTexto, divisaoSelecionada || null, v);
        }}
        placeholder="Tipo de gasto"
        className="w-28 text-xs"
        options={TIPOS_GASTO.map((t) => ({ value: t.value, label: t.label }))}
      />
    </div>
  );
}

type PlanejadoEditavel = {
  valorCentavos: number;
  itemId?: string;
  divisaoId: string | null;
  tipoGasto: string;
  pessoas: Pessoa[];
  onSalvar: (
    valorTexto: string,
    divisaoId: string | null,
    tipoGasto: string,
  ) => void;
};

function LinhaMes({
  label,
  indicador,
  destaque = false,
  expansivel = false,
  aberta = false,
  onToggle,
  planejadoEditavel,
}: {
  label: string;
  indicador: IndicadorPlanejado;
  destaque?: boolean;
  expansivel?: boolean;
  aberta?: boolean;
  onToggle?: () => void;
  planejadoEditavel?: PlanejadoEditavel;
}) {
  const diferenca = indicador.realCentavos - indicador.planejadoCentavos;
  const estourou = diferenca > 0;
  const percentual =
    indicador.planejadoCentavos > 0
      ? (Math.abs(diferenca) / indicador.planejadoCentavos) * 100
      : null;

  return (
    <tr
      className={`border-outline-variant/60 border-b ${
        destaque ? "bg-surface-container-low font-medium" : ""
      }`}
    >
      <td className={`p-3 ${destaque ? "" : "pl-8"}`}>
        <span className="gap-sm flex items-center">
          {expansivel ? (
            <button
              onClick={onToggle}
              aria-label={aberta ? "Recolher categoria" : "Expandir categoria"}
              className="text-on-surface-variant hover:text-primary"
            >
              {aberta ? "▾" : "▸"}
            </button>
          ) : destaque ? (
            <span className="inline-block w-3" />
          ) : null}
          {label}
        </span>
      </td>
      {planejadoEditavel ? (
        <CampoOrcamento
          key={
            planejadoEditavel.itemId ??
            `${label}-${planejadoEditavel.valorCentavos}-${planejadoEditavel.divisaoId}-${planejadoEditavel.tipoGasto}`
          }
          valorCentavos={planejadoEditavel.valorCentavos}
          temRegistro={!!planejadoEditavel.itemId}
          divisaoId={planejadoEditavel.divisaoId}
          tipoGasto={planejadoEditavel.tipoGasto}
          pessoas={planejadoEditavel.pessoas}
          onSalvar={planejadoEditavel.onSalvar}
        />
      ) : (
        <>
          <td className="p-3"></td>
          <td className="p-3"></td>
          <td className="data-tabular p-3 text-right">
            {centavosParaReais(indicador.planejadoCentavos)}
          </td>
        </>
      )}
      <td className="data-tabular p-3 text-right">
        {centavosParaReais(indicador.realCentavos)}
      </td>
      <td className="data-tabular p-3 text-right">
        {diferenca === 0 ? (
          <span className="text-on-surface-variant">
            {centavosParaReais(0)} (0%)
          </span>
        ) : (
          <span className={estourou ? "text-danger" : "text-success"}>
            {centavosParaReais(Math.abs(diferenca))}
            {percentual !== null && ` (${percentual.toFixed(1)}%)`}{" "}
            {estourou ? "↑" : "↓"}
          </span>
        )}
      </td>
    </tr>
  );
}

function VisaoAnual({
  ano,
  pessoaFiltro,
  editavel,
  categorias,
  pessoas,
  setErro,
}: {
  ano: number;
  pessoaFiltro: string;
  editavel: boolean;
  categorias: Categoria[] | null;
  pessoas: Pessoa[];
  setErro: (msg: string | null) => void;
}) {
  const [orcamentos, setOrcamentos] = useState<OrcamentoItem[] | null>(null);
  const [dados, setDados] = useState<PlanejadoVsRealCategoria[] | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  function recarregar() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    let cancelado = false;
    const pessoaQuery = pessoaFiltro === "" ? "" : `&pessoaId=${pessoaFiltro}`;
    fetch(`/api/orcamentos?ano=${ano}${pessoaQuery}`)
      .then(async (response) => {
        if (cancelado) return;
        if (!response.ok) {
          if (response.status !== 401)
            setErro("Não foi possível carregar o orçamento.");
          return;
        }
        setOrcamentos(await response.json());
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar o orçamento.");
      });
    return () => {
      cancelado = true;
    };
  }, [ano, pessoaFiltro, reloadToken, setErro]);

  useEffect(() => {
    let cancelado = false;
    const pessoaQuery = pessoaFiltro === "" ? "" : `&pessoaId=${pessoaFiltro}`;
    fetch(`/api/relatorios/planejado-vs-real?ano=${ano}${pessoaQuery}`)
      .then(async (response) => {
        if (cancelado) return;
        if (!response.ok) {
          if (response.status !== 401) {
            setErro("Não foi possível carregar o planejado vs. real.");
          }
          return;
        }
        setDados(
          unicosPorChave(await response.json(), (r: PlanejadoVsRealCategoria) =>
            chaveCategoria(r.categoriaId, r.subcategoriaId),
          ),
        );
      })
      .catch(() => {
        if (!cancelado)
          setErro("Não foi possível carregar o planejado vs. real.");
      });
    return () => {
      cancelado = true;
    };
  }, [ano, pessoaFiltro, reloadToken, setErro]);

  const mapaOrcamentos = useMemo(() => {
    const mapa = new Map<string, OrcamentoItem>();
    for (const o of orcamentos ?? []) {
      mapa.set(chave(o.categoriaId, o.subcategoriaId, o.mes), o);
    }
    return mapa;
  }, [orcamentos]);

  const itensPorSubcategoria = useMemo(
    () => agruparPorSubcategoria(orcamentos ?? []),
    [orcamentos],
  );

  const mapaDados = useMemo(() => {
    const mapa = new Map<string, PlanejadoVsRealCategoria>();
    for (const c of dados ?? []) {
      mapa.set(chaveCategoria(c.categoriaId, c.subcategoriaId), c);
    }
    return mapa;
  }, [dados]);

  function totalAnualSubcategoria(
    categoriaId: string,
    subcategoriaId: string | null,
  ): number {
    return (
      mapaDados.get(chaveCategoria(categoriaId, subcategoriaId))?.acumulado
        .planejadoCentavos ?? 0
    );
  }

  function totalAnualCategoria(categoria: Categoria): number {
    return categoria.subcategorias.reduce(
      (soma, sub) => soma + totalAnualSubcategoria(categoria.id, sub.id),
      totalAnualSubcategoria(categoria.id, null),
    );
  }

  function valorVigenteMes(
    categoriaId: string,
    subcategoriaId: string | null,
    mes: number,
  ): number {
    return (
      mapaDados
        .get(chaveCategoria(categoriaId, subcategoriaId))
        ?.meses.find((m) => m.mes === mes)?.planejadoCentavos ?? 0
    );
  }

  async function salvarCelula(
    categoriaId: string,
    subcategoriaId: string | null,
    mes: number,
    valorTexto: string,
    divisaoIdSelecionada: string | null,
    tipoGastoSelecionado: string,
    valorVigenteAntes: number,
    divisaoIdAntes: string | null,
    tipoGastoAntes: string,
  ) {
    setErro(null);
    const existente = mapaOrcamentos.get(
      chave(categoriaId, subcategoriaId, mes),
    );
    const valorCentavos =
      valorTexto.trim() === "" ? 0 : reaisParaCentavos(valorTexto);

    // Sem edição real: os três campos só exibiam o que já está vigente (mês
    // anterior ou limite sugerido da subcategoria), nada foi de fato
    // alterado.
    if (
      !existente &&
      valorCentavos === valorVigenteAntes &&
      divisaoIdSelecionada === divisaoIdAntes &&
      tipoGastoSelecionado === tipoGastoAntes
    ) {
      return;
    }

    // Campo de valor limpo (voltar a herdar o vigente): remove a entrada
    // específica deste mês, se houver — divisão/tipo do mês somem junto.
    if (existente && valorTexto.trim() === "") {
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
      if (
        existente.valorCentavos === valorCentavos &&
        existente.divisaoId === divisaoIdSelecionada &&
        existente.tipoGasto === tipoGastoSelecionado
      ) {
        return;
      }
      const response = await fetch(`/api/orcamentos/${existente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valorCentavos,
          divisaoId: divisaoIdSelecionada,
          tipoGasto: tipoGastoSelecionado,
        }),
      });
      if (!response.ok) {
        setErro(await parseErro(response));
        return;
      }
      recarregar();
      return;
    }

    // Novo valor a partir deste mês, inclusive zero (override explícito que
    // suprime o valor vigente/limite sugerido para este mês em diante).
    const response = await fetch("/api/orcamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pessoaId: pessoaFiltro,
        categoriaId,
        subcategoriaId,
        mes,
        ano,
        valorCentavos,
        divisaoId: divisaoIdSelecionada,
        tipoGasto: tipoGastoSelecionado,
      }),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    recarregar();
  }

  return (
    <div className="gap-lg flex flex-col">
      <p className="text-on-surface-variant text-sm">
        O valor definido em um mês vale para ele e para os meses seguintes, até
        você definir um novo valor. A coluna Anual é somente uma visualização do
        total do ano.
      </p>
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
                  itensPorSubcategoria={itensPorSubcategoria}
                  valorVigenteMes={valorVigenteMes}
                  totalAnual={totalAnualCategoria(categoria)}
                  onSalvar={salvarCelula}
                  editavel={editavel}
                  pessoas={pessoas}
                  destaque
                />
                {categoria.subcategorias.map((sub) => (
                  <LinhaOrcamento
                    key={sub.id}
                    label={sub.nome}
                    categoriaId={categoria.id}
                    subcategoriaId={sub.id}
                    mapaOrcamentos={mapaOrcamentos}
                    itensPorSubcategoria={itensPorSubcategoria}
                    valorVigenteMes={valorVigenteMes}
                    totalAnual={totalAnualSubcategoria(categoria.id, sub.id)}
                    onSalvar={salvarCelula}
                    editavel={editavel}
                    pessoas={pessoas}
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
  itensPorSubcategoria,
  valorVigenteMes,
  totalAnual,
  onSalvar,
  editavel,
  pessoas,
  destaque = false,
}: {
  label: string;
  categoriaId: string;
  subcategoriaId: string | null;
  mapaOrcamentos: Map<string, OrcamentoItem>;
  itensPorSubcategoria: Map<string, OrcamentoItem[]>;
  valorVigenteMes: (
    categoriaId: string,
    subcategoriaId: string | null,
    mes: number,
  ) => number;
  totalAnual: number;
  onSalvar: (
    categoriaId: string,
    subcategoriaId: string | null,
    mes: number,
    valorTexto: string,
    divisaoId: string | null,
    tipoGasto: string,
    valorVigenteAntes: number,
    divisaoIdAntes: string | null,
    tipoGastoAntes: string,
  ) => Promise<void>;
  editavel: boolean;
  pessoas: Pessoa[];
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
        const valorVigente = item
          ? item.valorCentavos
          : valorVigenteMes(categoriaId, subcategoriaId, mes);
        const extraVigente = vigenteExtra(
          itensPorSubcategoria.get(chaveCategoria(categoriaId, subcategoriaId)),
          mes,
        );
        const divisaoExibida = item?.divisaoId ?? extraVigente.divisaoId;
        const tipoExibido = item?.tipoGasto ?? extraVigente.tipoGasto;
        return (
          <td
            key={mes}
            className={editavel ? "p-1" : "data-tabular p-2 text-right"}
          >
            {editavel ? (
              <CampoOrcamentoCompacto
                key={
                  item?.id ??
                  `${chave(categoriaId, subcategoriaId, mes)}-${valorVigente}-${divisaoExibida}-${tipoExibido}`
                }
                valorCentavos={valorVigente}
                temRegistro={!!item}
                divisaoId={divisaoExibida}
                tipoGasto={tipoExibido}
                pessoas={pessoas}
                onSalvar={(valorTexto, divisaoId, tipoGasto) =>
                  onSalvar(
                    categoriaId,
                    subcategoriaId,
                    mes,
                    valorTexto,
                    divisaoId,
                    tipoGasto,
                    valorVigente,
                    divisaoExibida,
                    tipoExibido,
                  )
                }
              />
            ) : (
              centavosParaReais(valorVigente)
            )}
          </td>
        );
      })}
      <td className="data-tabular text-on-surface-variant p-2 text-right">
        {centavosParaReais(totalAnual)}
      </td>
    </tr>
  );
}
