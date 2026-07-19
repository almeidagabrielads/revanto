"use client";

import { useEffect, useState } from "react";

type PessoaResumo = { id: string; nome: string };
type LinhaControlePagamento = {
  divisaoId: string;
  pagadorId: string;
  porMes: Record<string, number>;
};
type ControlePagamento = {
  meses: string[];
  pessoasDivisao: PessoaResumo[];
  pagadores: PessoaResumo[];
  linhas: LinhaControlePagamento[];
};

const MESES_ABREVIADOS = [
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

function formatarMesAno(mesId: string): string {
  const [ano, mes] = mesId.split("-").map(Number);
  return `${MESES_ABREVIADOS[mes - 1]}/${String(ano).slice(2)}`;
}

function centavosParaReais(valor: number): string {
  return (valor / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

type Props = {
  dataInicio: string;
  dataFim: string;
  reloadToken: number;
};

export function ControlePagamentoCard({ dataInicio, dataFim, reloadToken }: Props) {
  const [controle, setControle] = useState<ControlePagamento | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(
      `/api/relatorios/controle-pagamento?dataInicio=${dataInicio}&dataFim=${dataFim}`,
    )
      .then(async (response) => {
        if (cancelado || !response.ok) return;
        setControle(await response.json());
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [dataInicio, dataFim, reloadToken]);

  if (!controle) return null;

  const nomeDivisao = new Map(controle.pessoasDivisao.map((p) => [p.id, p.nome]));
  const nomePagador = new Map(controle.pagadores.map((p) => [p.id, p.nome]));

  function valorDaLinha(divisaoId: string, pagadorId: string, mes: string): number {
    return (
      controle!.linhas.find(
        (l) => l.divisaoId === divisaoId && l.pagadorId === pagadorId,
      )?.porMes[mes] ?? 0
    );
  }

  const gastosTotais = controle.pagadores.map((pagador) => ({
    label: `Gasto total ${pagador.nome}`,
    porMes: Object.fromEntries(
      controle!.meses.map((mes) => [
        mes,
        controle!.linhas
          .filter((l) => l.pagadorId === pagador.id)
          .reduce((soma, l) => soma + (l.porMes[mes] ?? 0), 0),
      ]),
    ),
  }));

  const pares: { a: PessoaResumo; b: PessoaResumo }[] = [];
  for (let i = 0; i < controle.pagadores.length; i++) {
    for (let j = i + 1; j < controle.pagadores.length; j++) {
      pares.push({ a: controle.pagadores[i], b: controle.pagadores[j] });
    }
  }

  const linhasCruzadas = pares.flatMap(({ a, b }) => {
    const aPorB = Object.fromEntries(
      controle!.meses.map((mes) => [mes, valorDaLinha(b.id, a.id, mes)]),
    );
    const bPorA = Object.fromEntries(
      controle!.meses.map((mes) => [mes, valorDaLinha(a.id, b.id, mes)]),
    );
    const diferenca = Object.fromEntries(
      controle!.meses.map((mes) => [mes, aPorB[mes] - bPorA[mes]]),
    );
    return [
      { label: `Quanto ${a.nome} pagou pela ${b.nome}`, porMes: aPorB },
      { label: `Quanto ${b.nome} pagou pela ${a.nome}`, porMes: bPorA },
      {
        label: pares.length > 1 ? `Diferença (${a.nome} vs ${b.nome})` : "Diferença",
        porMes: diferenca,
        destaque: true,
      },
    ];
  });

  const linhasResumo = [
    ...gastosTotais.map((l) => ({ ...l, destaque: true })),
    ...linhasCruzadas,
  ];

  return (
    <div className="gap-md border-outline-variant bg-surface-container-lowest p-lg flex flex-col rounded-xl border">
      <h3 className="text-on-surface text-base font-semibold">
        Controle de pagamento
      </h3>
      {controle.linhas.length === 0 ? (
        <p className="text-on-surface-variant text-sm">
          Cadastre pelo menos uma pessoa Individual para ver o controle de
          pagamento.
        </p>
      ) : (
        <div className="border-outline-variant overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-on-surface-variant text-left text-xs font-semibold">
              <tr>
                <th className="p-sm">Divisão</th>
                <th className="p-sm">Quem pagou</th>
                {controle.meses.map((mes) => (
                  <th key={mes} className="p-sm text-right whitespace-nowrap">
                    {formatarMesAno(mes)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {controle.linhas.map((linha) => (
                <tr
                  key={`${linha.divisaoId}::${linha.pagadorId}`}
                  className="border-outline-variant border-t"
                >
                  <td className="p-sm font-medium">
                    {nomeDivisao.get(linha.divisaoId) ?? linha.divisaoId}
                  </td>
                  <td className="p-sm text-on-surface-variant">
                    {nomePagador.get(linha.pagadorId) ?? linha.pagadorId}
                  </td>
                  {controle.meses.map((mes) => (
                    <td
                      key={mes}
                      className="p-sm text-right whitespace-nowrap tabular-nums"
                    >
                      {linha.porMes[mes] === 0 ? (
                        <span className="text-on-surface-variant">
                          {centavosParaReais(0)}
                        </span>
                      ) : (
                        centavosParaReais(linha.porMes[mes])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tbody>
              {linhasResumo.map((linha, indice) => (
                <tr
                  key={linha.label}
                  className={`border-outline-variant ${
                    indice === 0 ? "border-t-2" : "border-t"
                  } ${linha.destaque ? "bg-surface-container-low font-semibold" : ""}`}
                >
                  <td className="p-sm" colSpan={2}>
                    {linha.label}
                  </td>
                  {controle.meses.map((mes) => (
                    <td
                      key={mes}
                      className="p-sm text-right whitespace-nowrap tabular-nums"
                    >
                      {centavosParaReais(linha.porMes[mes])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
