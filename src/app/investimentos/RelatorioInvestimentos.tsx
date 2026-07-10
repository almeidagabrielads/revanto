"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnHeader } from "../components/ColumnHeader";
import { Select } from "../components/Select";
import { useTabela, type ColunaTabela } from "../components/useTabela";
import { FAIXAS_LABEL } from "./InvestimentosClient";

const TIPOS_INVESTIMENTO = [
  { value: "RENDA_FIXA", label: "Renda Fixa", cor: "var(--color-primary)" },
  {
    value: "FUNDO",
    label: "Fundo de Investimento",
    cor: "var(--color-secondary)",
  },
  { value: "FGTS", label: "FGTS", cor: "var(--color-tertiary-container)" },
  { value: "OUTRO", label: "Outro", cor: "var(--color-outline)" },
] as const;

// Paleta categórica para agrupamentos dinâmicos (banco, titular) cujo número
// de categorias não é fixo. O tom cinza (outline) fica reservado para o
// bucket "Outros" — nunca geramos uma nova cor além destas.
const PALETTE_CATEGORICA = [
  "var(--color-primary)",
  "var(--color-secondary)",
  "var(--color-tertiary-container)",
  "var(--color-on-tertiary-container)",
];
const COR_OUTROS = "var(--color-outline)";

type GrupoAlocacao = {
  chave: string;
  label: string;
  cor: string;
  totalCentavos: number;
  // Rótulos originais agregados nesta fatia — normalmente só o próprio
  // label, mas o bucket "Outros" reúne vários (usado para filtrar a
  // Carteira por todos eles ao clicar).
  itens: string[];
};

function agruparComCores(
  grupos: { chave: string; label: string; totalCentavos: number }[],
): GrupoAlocacao[] {
  const ordenados = [...grupos]
    .filter((g) => g.totalCentavos > 0)
    .sort((a, b) => b.totalCentavos - a.totalCentavos);

  if (ordenados.length <= PALETTE_CATEGORICA.length) {
    return ordenados.map((g, i) => ({
      ...g,
      cor: PALETTE_CATEGORICA[i],
      itens: [g.label],
    }));
  }

  const limite = PALETTE_CATEGORICA.length - 1;
  const principais = ordenados.slice(0, limite).map((g, i) => ({
    ...g,
    cor: PALETTE_CATEGORICA[i],
    itens: [g.label],
  }));
  const resto = ordenados.slice(limite);
  const totalOutros = resto.reduce((soma, g) => soma + g.totalCentavos, 0);

  return [
    ...principais,
    {
      chave: "OUTROS",
      label: "Outros",
      totalCentavos: totalOutros,
      cor: COR_OUTROS,
      itens: resto.map((g) => g.label),
    },
  ];
}

type Banco = { id: string; nome: string };
type Pessoa = { id: string; nome: string };
type Investimento = {
  id: string;
  bancoId: string;
  pessoaId: string;
  tipo: string;
  produto: string;
  valorAtualCentavos: number;
};
type FaixaLiquidez = { faixa: string; totalCentavos: number };

// Prazos de liquidez têm uma ordem natural (mais perto → mais longe), por
// isso usam uma rampa ordinal (um só matiz, claro→escuro) em vez da paleta
// categórica. "Sem prazo definido" não é "o prazo mais longo", então fica
// com o mesmo cinza neutro usado para o bucket "Outros".
const ORDEM_LIQUIDEZ = [
  "IMEDIATO",
  "ATE_30_DIAS",
  "ATE_90_DIAS",
  "ATE_180_DIAS",
  "ATE_365_DIAS",
  "MAIS_DE_1_ANO",
] as const;

function corRampaLiquidez(indice: number): string {
  const percentual = 20 + indice * 16;
  return `color-mix(in srgb, var(--color-primary) ${percentual}%, white)`;
}
type LinhaRendimento = {
  mes: string;
  posicaoCentavos: number;
  rendimentoAcumuladoRealPercentual: number;
  cdiAcumuladoPercentual: number;
};

function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function corTipo(tipo: string): string {
  return (
    TIPOS_INVESTIMENTO.find((t) => t.value === tipo)?.cor ??
    "var(--color-outline)"
  );
}

function labelTipo(tipo: string): string {
  return TIPOS_INVESTIMENTO.find((t) => t.value === tipo)?.label ?? tipo;
}

function Donut({
  fatias,
}: {
  fatias: {
    cor: string;
    valor: number;
    titulo?: string;
    onClick?: () => void;
  }[];
}) {
  const total = fatias.reduce((soma, f) => soma + f.valor, 0);
  const raio = 60;
  const circunferencia = 2 * Math.PI * raio;
  let acumulado = 0;

  return (
    <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
      <circle
        cx={80}
        cy={80}
        r={raio}
        fill="none"
        stroke="var(--color-surface-container)"
        strokeWidth={20}
      />
      {total > 0 &&
        fatias
          .filter((f) => f.valor > 0)
          .map((f, i) => {
            const fracao = f.valor / total;
            const comprimento = fracao * circunferencia;
            const offset = -acumulado * circunferencia;
            acumulado += fracao;
            return (
              <circle
                key={i}
                cx={80}
                cy={80}
                r={raio}
                fill="none"
                stroke={f.cor}
                strokeWidth={20}
                strokeDasharray={`${comprimento} ${circunferencia - comprimento}`}
                strokeDashoffset={offset}
                onClick={f.onClick}
                className={f.onClick ? "cursor-pointer" : undefined}
              >
                {f.titulo && <title>{f.titulo}</title>}
              </circle>
            );
          })}
    </svg>
  );
}

function AlocacaoCard({
  titulo,
  grupos,
  onSelecionar,
}: {
  titulo: string;
  grupos: GrupoAlocacao[];
  onSelecionar?: (grupo: GrupoAlocacao) => void;
}) {
  return (
    <section className="gap-md border-outline-variant bg-surface-container-lowest p-lg flex flex-col rounded-xl border shadow-sm">
      <h2 className="text-on-surface text-base font-bold">{titulo}</h2>
      {grupos.length > 0 ? (
        <>
          <div className="flex justify-center">
            <Donut
              fatias={grupos.map((g) => ({
                cor: g.cor,
                valor: g.totalCentavos,
                titulo: `${g.label}: ${formatarReais(g.totalCentavos)}`,
                onClick: onSelecionar ? () => onSelecionar(g) : undefined,
              }))}
            />
          </div>
          <ul className="flex flex-col gap-2">
            {grupos.map((g) => (
              <li key={g.chave} className="flex items-center gap-2 text-sm">
                {onSelecionar ? (
                  <button
                    type="button"
                    onClick={() => onSelecionar(g)}
                    title={`Ver na Carteira: ${g.label}`}
                    className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg text-left hover:underline"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: g.cor }}
                    />
                    <span className="text-on-surface-variant">{g.label}</span>
                  </button>
                ) : (
                  <>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: g.cor }}
                    />
                    <span className="text-on-surface-variant">{g.label}</span>
                  </>
                )}
                <span className="data-tabular text-on-surface ml-auto font-medium">
                  {formatarReais(g.totalCentavos)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-on-surface-variant text-sm">
          Nenhum investimento cadastrado.
        </p>
      )}
    </section>
  );
}

// Escolhe um passo "redondo" (1/2/5 × potência de 10) para os ticks do eixo Y,
// e devolve os limites já arredondados para esse passo.
function calcularTicksEixoY(
  min: number,
  max: number,
  quantidade = 5,
): { ticks: number[]; min: number; max: number } {
  if (min === max) {
    return { ticks: [min], min: min - 1, max: max + 1 };
  }
  const passoBruto = (max - min) / (quantidade - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(passoBruto)));
  const residual = passoBruto / magnitude;
  const passoLimpo =
    (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;

  const minLimpo = Math.floor(min / passoLimpo) * passoLimpo;
  const maxLimpo = Math.ceil(max / passoLimpo) * passoLimpo;
  const ticks: number[] = [];
  for (let v = minLimpo; v <= maxLimpo + passoLimpo / 2; v += passoLimpo) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return { ticks, min: minLimpo, max: maxLimpo };
}

function GraficoRendimento({ linhas }: { linhas: LinhaRendimento[] }) {
  const largura = 640;
  const altura = 220;
  const padTop = 12;
  const padBottom = 12;
  const padLeft = 52;
  const padRight = 8;

  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const valores = linhas.flatMap((l) => [
    l.rendimentoAcumuladoRealPercentual,
    l.cdiAcumuladoPercentual,
  ]);
  const {
    ticks,
    min,
    max,
  } = calcularTicksEixoY(Math.min(0, ...valores), Math.max(0, ...valores, 0.01));

  function coordenadas(
    chave: "rendimentoAcumuladoRealPercentual" | "cdiAcumuladoPercentual",
    i: number,
  ): { x: number; y: number } {
    const x =
      linhas.length === 1
        ? padLeft
        : padLeft + (i / (linhas.length - 1)) * (largura - padLeft - padRight);
    const y =
      altura -
      padBottom -
      ((linhas[i][chave] - min) / (max - min)) * (altura - padTop - padBottom);
    return { x, y };
  }

  function pontos(chave: "rendimentoAcumuladoRealPercentual" | "cdiAcumuladoPercentual"): string {
    if (linhas.length === 1) {
      const { y } = coordenadas(chave, 0);
      return `${padLeft},${y} ${largura - padRight},${y}`;
    }
    return linhas.map((_, i) => `${coordenadas(chave, i).x},${coordenadas(chave, i).y}`).join(" ");
  }

  function yDoValor(valor: number): number {
    return (
      altura -
      padBottom -
      ((valor - min) / (max - min)) * (altura - padTop - padBottom)
    );
  }

  function aoMoverMouse(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || linhas.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * largura;
    const usableWidth = largura - padLeft - padRight;
    const frac =
      linhas.length === 1 ? 0 : (svgX - padLeft) / usableWidth;
    const index = Math.min(
      linhas.length - 1,
      Math.max(0, Math.round(frac * (linhas.length - 1))),
    );
    setHoverIndex(index);
  }

  const linhaAtiva = hoverIndex !== null ? linhas[hoverIndex] : null;
  const pontoCarteira =
    hoverIndex !== null ? coordenadas("rendimentoAcumuladoRealPercentual", hoverIndex) : null;
  const pontoCdi =
    hoverIndex !== null ? coordenadas("cdiAcumuladoPercentual", hoverIndex) : null;

  const tooltipLeftPct = pontoCarteira
    ? Math.min(92, Math.max(8, (pontoCarteira.x / largura) * 100))
    : 0;
  const tooltipTopPct =
    pontoCarteira && pontoCdi
      ? Math.max(0, (Math.min(pontoCarteira.y, pontoCdi.y) / altura) * 100)
      : 0;

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${largura} ${altura}`}
        className="w-full"
        preserveAspectRatio="none"
        onMouseMove={aoMoverMouse}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={padLeft}
              x2={largura - padRight}
              y1={yDoValor(v)}
              y2={yDoValor(v)}
              stroke={
                v === 0
                  ? "var(--color-outline)"
                  : "var(--color-outline-variant)"
              }
              strokeWidth={v === 0 ? 1 : 0.5}
            />
            <text
              x={padLeft - 6}
              y={yDoValor(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill="var(--color-on-surface-variant)"
            >
              {v.toFixed(1)}%
            </text>
          </g>
        ))}

        <polyline
          points={pontos("cdiAcumuladoPercentual")}
          fill="none"
          stroke="var(--color-outline)"
          strokeWidth={2}
        />
        <polyline
          points={pontos("rendimentoAcumuladoRealPercentual")}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={3}
        />

        {hoverIndex !== null && pontoCarteira && pontoCdi && (
          <g pointerEvents="none">
            <line
              x1={pontoCarteira.x}
              x2={pontoCarteira.x}
              y1={padTop}
              y2={altura - padBottom}
              stroke="var(--color-outline-variant)"
              strokeWidth={1}
            />
            <circle
              cx={pontoCdi.x}
              cy={pontoCdi.y}
              r={4}
              fill="var(--color-surface-container-lowest)"
              stroke="var(--color-outline)"
              strokeWidth={2}
            />
            <circle
              cx={pontoCarteira.x}
              cy={pontoCarteira.y}
              r={4}
              fill="var(--color-surface-container-lowest)"
              stroke="var(--color-primary)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>

      {linhaAtiva && (
        <div
          className="border-outline-variant bg-surface-container-highest p-sm pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-[calc(100%+10px)] flex-col gap-1 rounded-lg border text-xs whitespace-nowrap shadow-md"
          style={{ left: `${tooltipLeftPct}%`, top: `${tooltipTopPct}%` }}
        >
          <span className="text-on-surface font-semibold">
            {(() => {
              const texto = new Date(linhaAtiva.mes).toLocaleDateString(
                "pt-BR",
                { month: "long", year: "numeric", timeZone: "UTC" },
              );
              return texto.charAt(0).toUpperCase() + texto.slice(1);
            })()}
          </span>
          <span className="text-on-surface-variant">
            Patrimônio:{" "}
            <span className="text-on-surface font-medium">
              {formatarReais(linhaAtiva.posicaoCentavos)}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-primary h-2 w-2 rounded-full" />
            <span className="text-on-surface-variant">Carteira:</span>
            <span className="text-on-surface font-medium">
              {linhaAtiva.rendimentoAcumuladoRealPercentual.toFixed(2)}%
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-outline h-2 w-2 rounded-full" />
            <span className="text-on-surface-variant">CDI:</span>
            <span className="text-on-surface font-medium">
              {linhaAtiva.cdiAcumuladoPercentual.toFixed(2)}%
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

export function RelatorioInvestimentos({
  investimentos,
  bancos,
  pessoas,
  liquidez,
  onFiltrarCarteira,
}: {
  investimentos: Investimento[];
  bancos: Banco[];
  pessoas: Pessoa[];
  liquidez: FaixaLiquidez[];
  onFiltrarCarteira?: (
    chave: "tipo" | "banco" | "titular" | "faixaLiquidez",
    valores: string[],
  ) => void;
}) {
  const anoAtual = new Date().getUTCFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [rendimento, setRendimento] = useState<LinhaRendimento[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/patrimonio/rendimento?ano=${ano}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((dados) => {
        if (!cancelado) setRendimento(dados);
      })
      .catch(() => {
        if (!cancelado) setRendimento([]);
      });
    return () => {
      cancelado = true;
    };
  }, [ano]);

  const totalCentavos = investimentos.reduce(
    (soma, inv) => soma + inv.valorAtualCentavos,
    0,
  );

  const grupos = useMemo(() => {
    return TIPOS_INVESTIMENTO.map((t) => ({
      ...t,
      totalCentavos: investimentos
        .filter((inv) => inv.tipo === t.value)
        .reduce((soma, inv) => soma + inv.valorAtualCentavos, 0),
      itens: investimentos.filter((inv) => inv.tipo === t.value),
    })).filter((g) => g.totalCentavos > 0);
  }, [investimentos]);

  const ultimaLinha =
    rendimento && rendimento.length > 0
      ? rendimento[rendimento.length - 1]
      : null;

  const bancosPorId = useMemo(
    () => new Map(bancos.map((b) => [b.id, b])),
    [bancos],
  );
  const pessoasPorId = useMemo(
    () => new Map(pessoas.map((p) => [p.id, p])),
    [pessoas],
  );

  const gruposClasse = useMemo<GrupoAlocacao[]>(
    () =>
      grupos.map((g) => ({
        chave: g.value,
        label: g.label,
        cor: g.cor,
        totalCentavos: g.totalCentavos,
        itens: [g.label],
      })),
    [grupos],
  );

  const gruposBanco = useMemo(() => {
    const totais = new Map<string, number>();
    for (const inv of investimentos) {
      totais.set(
        inv.bancoId,
        (totais.get(inv.bancoId) ?? 0) + inv.valorAtualCentavos,
      );
    }
    return agruparComCores(
      [...totais.entries()].map(([bancoId, totalCentavos]) => ({
        chave: bancoId,
        label: bancosPorId.get(bancoId)?.nome ?? "—",
        totalCentavos,
      })),
    );
  }, [investimentos, bancosPorId]);

  const gruposTitular = useMemo(() => {
    const totais = new Map<string, number>();
    for (const inv of investimentos) {
      totais.set(
        inv.pessoaId,
        (totais.get(inv.pessoaId) ?? 0) + inv.valorAtualCentavos,
      );
    }
    return agruparComCores(
      [...totais.entries()].map(([pessoaId, totalCentavos]) => ({
        chave: pessoaId,
        label: pessoasPorId.get(pessoaId)?.nome ?? "—",
        totalCentavos,
      })),
    );
  }, [investimentos, pessoasPorId]);

  const gruposLiquidez = useMemo<GrupoAlocacao[]>(() => {
    const porFaixa = new Map(liquidez.map((l) => [l.faixa, l.totalCentavos]));

    const definidos = ORDEM_LIQUIDEZ.map((faixa, i) => {
      const label = FAIXAS_LABEL[faixa] ?? faixa;
      return {
        chave: faixa,
        label,
        cor: corRampaLiquidez(i),
        totalCentavos: porFaixa.get(faixa) ?? 0,
        itens: [label],
      };
    }).filter((g) => g.totalCentavos > 0);

    const totalIndefinido = porFaixa.get("INDEFINIDO") ?? 0;
    if (totalIndefinido <= 0) return definidos;

    const labelIndefinido = FAIXAS_LABEL.INDEFINIDO;
    return [
      ...definidos,
      {
        chave: "INDEFINIDO",
        label: labelIndefinido,
        cor: COR_OUTROS,
        totalCentavos: totalIndefinido,
        itens: [labelIndefinido],
      },
    ];
  }, [liquidez]);

  const colunasInvestimentos = useMemo<ColunaTabela<Investimento>[]>(
    () => [
      {
        chave: "classe",
        tipo: "opcoes",
        acessor: (inv) => labelTipo(inv.tipo),
      },
      {
        chave: "instituicao",
        tipo: "opcoes",
        acessor: (inv) => bancosPorId.get(inv.bancoId)?.nome ?? "—",
      },
      {
        chave: "titular",
        tipo: "opcoes",
        acessor: (inv) => pessoasPorId.get(inv.pessoaId)?.nome ?? "—",
      },
      {
        chave: "valor",
        tipo: "numero",
        acessor: (inv) => inv.valorAtualCentavos / 100,
      },
    ],
    [bancosPorId, pessoasPorId],
  );

  const investimentosDetalhe = useMemo(
    () => grupos.flatMap((g) => g.itens),
    [grupos],
  );

  const {
    linhas: investimentosParaExibir,
    ordenacao,
    alternarOrdenacao,
    filtros,
    definirFiltro,
    limparFiltro,
  } = useTabela(investimentosDetalhe, colunasInvestimentos);

  const opcoesColunasInvestimentos = useMemo(() => {
    const unicos = (valores: string[]) =>
      [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      classe: unicos(investimentosDetalhe.map((inv) => labelTipo(inv.tipo))),
      instituicao: unicos(
        investimentosDetalhe.map(
          (inv) => bancosPorId.get(inv.bancoId)?.nome ?? "—",
        ),
      ),
      titular: unicos(
        investimentosDetalhe.map(
          (inv) => pessoasPorId.get(inv.pessoaId)?.nome ?? "—",
        ),
      ),
    };
  }, [investimentosDetalhe, bancosPorId, pessoasPorId]);

  return (
    <div className="gap-lg flex flex-col">
      <div className="gap-sm flex items-center">
        <label
          className="text-on-surface-variant text-xs font-semibold"
          htmlFor="ano-relatorio"
        >
          Ano
        </label>
        <Select
          id="ano-relatorio"
          value={String(ano)}
          onChange={(v) => setAno(Number(v))}
          options={[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => ({
            value: String(a),
            label: String(a),
          }))}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">
          Patrimônio em investimentos
        </span>
        <span className="text-on-surface text-3xl font-bold">
          {formatarReais(totalCentavos)}
        </span>
      </div>

      <div className="gap-lg grid grid-cols-1 md:grid-cols-3">
        <AlocacaoCard
          titulo="Alocação por Classe"
          grupos={gruposClasse}
          onSelecionar={
            onFiltrarCarteira
              ? (g) => onFiltrarCarteira("tipo", g.itens)
              : undefined
          }
        />
        <AlocacaoCard
          titulo="Alocação por Banco"
          grupos={gruposBanco}
          onSelecionar={
            onFiltrarCarteira
              ? (g) => onFiltrarCarteira("banco", g.itens)
              : undefined
          }
        />
        <AlocacaoCard
          titulo="Alocação por Titular"
          grupos={gruposTitular}
          onSelecionar={
            onFiltrarCarteira
              ? (g) => onFiltrarCarteira("titular", g.itens)
              : undefined
          }
        />
      </div>

      <div className="gap-lg grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr]">
        <AlocacaoCard
          titulo="Liquidez de Resgate"
          grupos={gruposLiquidez}
          onSelecionar={
            onFiltrarCarteira
              ? (g) => onFiltrarCarteira("faixaLiquidez", g.itens)
              : undefined
          }
        />

        <section className="gap-md border-outline-variant bg-surface-container-lowest p-lg flex flex-col rounded-xl border shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-on-surface text-base font-bold">
              Performance: Rendimento vs. CDI
            </h2>
            <div className="gap-md text-on-surface-variant flex items-center text-xs">
              <span className="flex items-center gap-1">
                <span className="bg-primary h-2 w-2 rounded-full" /> Carteira
              </span>
              <span className="flex items-center gap-1">
                <span className="bg-outline h-2 w-2 rounded-full" /> CDI
              </span>
            </div>
          </div>
          {rendimento === null ? (
            <p className="text-on-surface-variant text-sm">Carregando…</p>
          ) : rendimento.length > 0 ? (
            <>
              <GraficoRendimento linhas={rendimento} />
              <div
                className="text-on-surface-variant flex justify-between text-xs"
                style={{ paddingLeft: "8.125%", paddingRight: "1.25%" }}
              >
                {rendimento.map((l) => (
                  <span key={l.mes}>
                    {new Date(l.mes).toLocaleDateString("pt-BR", {
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                ))}
              </div>
              {ultimaLinha && (
                <p className="text-on-surface-variant text-sm">
                  Acumulado no ano: carteira{" "}
                  <span className="text-on-surface font-semibold">
                    {ultimaLinha.rendimentoAcumuladoRealPercentual.toFixed(2)}%
                  </span>{" "}
                  vs. CDI{" "}
                  <span className="text-on-surface font-semibold">
                    {ultimaLinha.cdiAcumuladoPercentual.toFixed(2)}%
                  </span>
                </p>
              )}
            </>
          ) : (
            <p className="text-on-surface-variant text-sm">
              Sem posições de patrimônio lançadas em {ano}.
            </p>
          )}
        </section>
      </div>

      <section className="gap-sm border-outline-variant bg-surface-container-lowest p-lg flex flex-col rounded-xl border shadow-sm">
        <h2 className="text-on-surface text-base font-bold">
          Detalhamento por Classe
        </h2>
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-outline-variant text-on-surface-variant border-b text-xs font-semibold tracking-wide uppercase">
              <ColumnHeader
                label="Classe"
                chave="classe"
                tipo="opcoes"
                opcoes={opcoesColunasInvestimentos.classe}
                ordenacao={ordenacao}
                onOrdenar={alternarOrdenacao}
                filtro={filtros.classe}
                onFiltrar={definirFiltro}
                onLimparFiltro={limparFiltro}
              />
              <ColumnHeader
                label="Instituição"
                chave="instituicao"
                tipo="opcoes"
                opcoes={opcoesColunasInvestimentos.instituicao}
                ordenacao={ordenacao}
                onOrdenar={alternarOrdenacao}
                filtro={filtros.instituicao}
                onFiltrar={definirFiltro}
                onLimparFiltro={limparFiltro}
              />
              <ColumnHeader
                label="Titular"
                chave="titular"
                tipo="opcoes"
                opcoes={opcoesColunasInvestimentos.titular}
                ordenacao={ordenacao}
                onOrdenar={alternarOrdenacao}
                filtro={filtros.titular}
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
              <th className="p-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {investimentosParaExibir.map((inv) => {
              const banco = bancosPorId.get(inv.bancoId);
              const pessoa = pessoasPorId.get(inv.pessoaId);
              return (
                <tr key={inv.id} className="border-outline-variant/60 border-b">
                  <td className="p-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: corTipo(inv.tipo) }}
                      />
                      {labelTipo(inv.tipo)}
                    </span>
                  </td>
                  <td className="p-2">{banco?.nome ?? "—"}</td>
                  <td className="p-2">{pessoa?.nome ?? "—"}</td>
                  <td className="data-tabular p-2 text-right font-medium">
                    {formatarReais(inv.valorAtualCentavos)}
                  </td>
                  <td className="data-tabular text-on-surface-variant p-2 text-right">
                    {totalCentavos > 0
                      ? `${((inv.valorAtualCentavos / totalCentavos) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {investimentosParaExibir.length === 0 && (
          <p className="text-on-surface-variant text-sm">
            {investimentos.length === 0
              ? "Nenhum investimento cadastrado."
              : "Nenhum investimento corresponde aos filtros das colunas."}
          </p>
        )}
      </section>
    </div>
  );
}
