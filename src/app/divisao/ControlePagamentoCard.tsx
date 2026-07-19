"use client";

import { useEffect, useState } from "react";
import { Select } from "../components/Select";

type PessoaResumo = { id: string; nome: string };
type LinhaControlePagamento = {
  divisaoId: string;
  pagadorId: string;
  porMes: Record<string, number>;
};
type LinhaPagouPor = {
  pessoaId: string;
  pagadorId: string;
  porMes: Record<string, number>;
};
type LinhaGastoTotal = {
  pessoaId: string;
  porMes: Record<string, number>;
};
type ControlePagamento = {
  meses: string[];
  pessoasDivisao: PessoaResumo[];
  pagadores: PessoaResumo[];
  linhas: LinhaControlePagamento[];
  pagouPor: LinhaPagouPor[];
  gastoTotal: LinhaGastoTotal[];
};
type LinhaResumo = {
  label: string;
  porMes: Record<string, number>;
  destaque?: boolean;
  diferenca?: boolean;
  pessoaA?: string;
  pessoaB?: string;
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

function textoDiferenca(
  valor: number,
  pessoaA: string,
  pessoaB: string,
): string {
  if (valor === 0) return "Quitado";
  return valor > 0
    ? `${pessoaB} deve ${centavosParaReais(valor)}`
    : `${pessoaA} deve ${centavosParaReais(-valor)}`;
}

function mesAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

type Props = {
  reloadToken: number;
};

const ANO_ATUAL = new Date().getFullYear();
const OPCOES_ANO = Array.from({ length: 6 }, (_, i) => {
  const ano = ANO_ATUAL - i;
  return { value: String(ano), label: String(ano) };
});

export function ControlePagamentoCard({ reloadToken }: Props) {
  const [ano, setAno] = useState(ANO_ATUAL);
  const [controle, setControle] = useState<ControlePagamento | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/relatorios/controle-pagamento?ano=${ano}`)
      .then(async (response) => {
        if (cancelado || !response.ok) return;
        setControle(await response.json());
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [reloadToken, ano]);

  if (!controle) return null;

  const mesAtualCalculado = mesAtual();
  const nomeDivisao = new Map(
    controle.pessoasDivisao.map((p) => [p.id, p.nome]),
  );
  const nomePagador = new Map(controle.pagadores.map((p) => [p.id, p.nome]));

  // Inclui a fatia de cada pessoa nos gastos de grupos (Casal/Família) de que
  // participa, além dos gastos individuais pagos pela outra — ver pagouPor no
  // domínio (controlePagamento.ts).
  function valorPagoPor(
    pessoaId: string,
    pagadorId: string,
    mes: string,
  ): number {
    return (
      controle!.pagouPor.find(
        (l) => l.pessoaId === pessoaId && l.pagadorId === pagadorId,
      )?.porMes[mes] ?? 0
    );
  }

  // Mesma métrica do card "Gastos totais" do dashboard: gastos com divisão na
  // própria pessoa + a fração dela nos grupos de que participa (gastoTotal
  // vem pronto do backend — ver controlePagamento.ts).
  const gastosTotais = controle.pagadores.map((pagador) => ({
    label: `Gasto total ${pagador.nome}`,
    porMes: Object.fromEntries(
      controle!.meses.map((mes) => [
        mes,
        controle!.gastoTotal.find((g) => g.pessoaId === pagador.id)?.porMes[
          mes
        ] ?? 0,
      ]),
    ),
  }));

  const pares: { a: PessoaResumo; b: PessoaResumo }[] = [];
  for (let i = 0; i < controle.pagadores.length; i++) {
    for (let j = i + 1; j < controle.pagadores.length; j++) {
      pares.push({ a: controle.pagadores[i], b: controle.pagadores[j] });
    }
  }

  const linhasCruzadas: LinhaResumo[] = pares.flatMap(({ a, b }) => {
    const aPorB = Object.fromEntries(
      controle!.meses.map((mes) => [mes, valorPagoPor(b.id, a.id, mes)]),
    );
    const bPorA = Object.fromEntries(
      controle!.meses.map((mes) => [mes, valorPagoPor(a.id, b.id, mes)]),
    );
    const diferenca = Object.fromEntries(
      controle!.meses.map((mes) => [mes, aPorB[mes] - bPorA[mes]]),
    );
    return [
      { label: `Quanto ${a.nome} pagou pela ${b.nome}`, porMes: aPorB },
      { label: `Quanto ${b.nome} pagou pela ${a.nome}`, porMes: bPorA },
      {
        label:
          pares.length > 1 ? `Diferença (${a.nome} vs ${b.nome})` : "Diferença",
        porMes: diferenca,
        diferenca: true,
        pessoaA: a.nome,
        pessoaB: b.nome,
      },
    ];
  });

  const linhasResumo: LinhaResumo[] = [
    ...gastosTotais.map((l) => ({ ...l, destaque: true })),
    ...linhasCruzadas,
  ];

  return (
    <div className="gap-md border-outline-variant bg-surface-container-lowest p-lg flex flex-col rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-on-surface text-base font-semibold">
          Controle de pagamento
        </h3>
        <div className="flex items-center gap-1.5">
          <label
            htmlFor="controle-pagamento-ano"
            className="text-on-surface-variant text-xs font-semibold"
          >
            Ano
          </label>
          <Select
            id="controle-pagamento-ano"
            value={String(ano)}
            onChange={(valor) => setAno(Number(valor))}
            options={OPCOES_ANO}
            className="w-28"
          />
        </div>
      </div>
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
                <th className="p-sm bg-surface-container-low sticky left-0 z-20 whitespace-nowrap">
                  Divisão · Quem pagou
                </th>
                {controle.meses.map((mes) => (
                  <th
                    key={mes}
                    className={`p-sm text-right whitespace-nowrap ${
                      mes === mesAtualCalculado
                        ? "bg-primary-container text-on-primary-container"
                        : ""
                    }`}
                  >
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
                  <td className="p-sm bg-surface-container-lowest sticky left-0 z-10 font-medium whitespace-nowrap">
                    {nomeDivisao.get(linha.divisaoId) ?? linha.divisaoId} ·{" "}
                    {nomePagador.get(linha.pagadorId) ?? linha.pagadorId}
                  </td>
                  {controle.meses.map((mes) => (
                    <td
                      key={mes}
                      className={`p-sm text-right whitespace-nowrap tabular-nums ${
                        mes === mesAtualCalculado
                          ? "bg-primary-container/25"
                          : ""
                      }`}
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
              {linhasResumo.map((linha, indice) => {
                const corLinha = linha.diferenca
                  ? "bg-secondary-container text-on-secondary-container"
                  : linha.destaque
                    ? "bg-surface-container-low"
                    : "";
                return (
                  <tr
                    key={linha.label}
                    className={`border-outline-variant ${
                      indice === 0 ? "border-t-2" : "border-t"
                    } ${corLinha} ${linha.destaque || linha.diferenca ? "font-semibold" : ""}`}
                  >
                    <td
                      className={`p-sm sticky left-0 z-10 whitespace-nowrap ${
                        corLinha || "bg-surface-container-lowest"
                      }`}
                    >
                      {linha.label}
                    </td>
                    {controle.meses.map((mes) => (
                      <td
                        key={mes}
                        className={`p-sm text-right whitespace-nowrap tabular-nums ${
                          !linha.destaque &&
                          !linha.diferenca &&
                          mes === mesAtualCalculado
                            ? "bg-primary-container/25"
                            : ""
                        }`}
                      >
                        {linha.diferenca && linha.pessoaA && linha.pessoaB ? (
                          linha.porMes[mes] === 0 ? (
                            <span className="text-on-secondary-container/70 font-normal">
                              Quitado
                            </span>
                          ) : (
                            textoDiferenca(
                              linha.porMes[mes],
                              linha.pessoaA,
                              linha.pessoaB,
                            )
                          )
                        ) : linha.porMes[mes] === 0 ? (
                          <span className="text-on-surface-variant">
                            {centavosParaReais(0)}
                          </span>
                        ) : (
                          centavosParaReais(linha.porMes[mes])
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
