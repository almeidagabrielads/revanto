"use client";

import { useEffect, useMemo, useState } from "react";
import { ColumnHeader } from "../components/ColumnHeader";
import { useTabela, type ColunaTabela } from "../components/useTabela";

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
};

function agruparComCores(
  grupos: { chave: string; label: string; totalCentavos: number }[],
): GrupoAlocacao[] {
  const ordenados = [...grupos]
    .filter((g) => g.totalCentavos > 0)
    .sort((a, b) => b.totalCentavos - a.totalCentavos);

  if (ordenados.length <= PALETTE_CATEGORICA.length) {
    return ordenados.map((g, i) => ({ ...g, cor: PALETTE_CATEGORICA[i] }));
  }

  const limite = PALETTE_CATEGORICA.length - 1;
  const principais = ordenados
    .slice(0, limite)
    .map((g, i) => ({ ...g, cor: PALETTE_CATEGORICA[i] }));
  const totalOutros = ordenados
    .slice(limite)
    .reduce((soma, g) => soma + g.totalCentavos, 0);

  return [
    ...principais,
    {
      chave: "OUTROS",
      label: "Outros",
      totalCentavos: totalOutros,
      cor: COR_OUTROS,
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
type LinhaRendimento = {
  mes: string;
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

function Donut({ fatias }: { fatias: { cor: string; valor: number }[] }) {
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
              />
            );
          })}
    </svg>
  );
}

function AlocacaoCard({
  titulo,
  grupos,
}: {
  titulo: string;
  grupos: GrupoAlocacao[];
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
              }))}
            />
          </div>
          <ul className="flex flex-col gap-2">
            {grupos.map((g) => (
              <li key={g.chave} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: g.cor }}
                />
                <span className="text-on-surface-variant">{g.label}</span>
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

function GraficoRendimento({ linhas }: { linhas: LinhaRendimento[] }) {
  const largura = 640;
  const altura = 220;
  const padding = 8;

  const valores = linhas.flatMap((l) => [
    l.rendimentoAcumuladoRealPercentual,
    l.cdiAcumuladoPercentual,
  ]);
  const min = Math.min(0, ...valores);
  const max = Math.max(0, ...valores, 0.01);

  function pontos(chave: keyof LinhaRendimento): string {
    if (linhas.length === 1) {
      const y =
        altura -
        padding -
        (((linhas[0][chave] as number) - min) / (max - min)) *
          (altura - 2 * padding);
      return `${padding},${y} ${largura - padding},${y}`;
    }
    return linhas
      .map((l, i) => {
        const x = padding + (i / (linhas.length - 1)) * (largura - 2 * padding);
        const y =
          altura -
          padding -
          (((l[chave] as number) - min) / (max - min)) * (altura - 2 * padding);
        return `${x},${y}`;
      })
      .join(" ");
  }

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="w-full"
      preserveAspectRatio="none"
    >
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
    </svg>
  );
}

export function RelatorioInvestimentos({
  investimentos,
  bancos,
  pessoas,
}: {
  investimentos: Investimento[];
  bancos: Banco[];
  pessoas: Pessoa[];
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

  const colunasInvestimentos = useMemo<ColunaTabela<Investimento>[]>(
    () => [
      { chave: "classe", tipo: "opcoes", acessor: (inv) => labelTipo(inv.tipo) },
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
        <select
          id="ano-relatorio"
          className="border-outline-variant bg-surface-container-lowest rounded-lg border px-2 py-1 text-sm"
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
        >
          {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
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
        <AlocacaoCard titulo="Alocação por Classe" grupos={gruposClasse} />
        <AlocacaoCard titulo="Alocação por Banco" grupos={gruposBanco} />
        <AlocacaoCard titulo="Alocação por Titular" grupos={gruposTitular} />
      </div>

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
            <div className="text-on-surface-variant flex justify-between text-xs">
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
