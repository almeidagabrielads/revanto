"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { unicosPorId } from "@/lib/dedupe";
import { valorLiquidoCentavos } from "@/lib/domain/lancamentos";

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

type Transferencia = { deId: string; paraId: string; valorCentavos: number };
type SaldoDivisaoGrupo = {
  participantes: string[];
  transferenciasSugeridas: Transferencia[];
};

type MesPlanejadoVsReal = {
  mes: number;
  planejadoCentavos: number;
  realCentavos: number;
};

type PlanejadoVsRealCategoria = {
  categoriaId: string;
  meses: MesPlanejadoVsReal[];
};

type Lancamento = {
  id: string;
  data: string;
  descricaoOrigem: string | null;
  descricaoPropria: string | null;
  valorCentavos: number;
  descontoCentavos: number;
  pessoaDivisaoId: string;
  pessoaPagouId: string;
};

type Pessoa = { id: string; nome: string };
type Categoria = { id: string; nome: string };

function centavosParaReais(valor: number): string {
  return (valor / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function primeiroEUltimoDiaDoMes(
  ano: number,
  mes: number,
): { inicio: string; fim: string } {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return { inicio, fim };
}

export function DashboardMensal({ ano, mes }: { ano: number; mes: number }) {
  const [saldo, setSaldo] = useState<SaldoAnual | null>(null);
  const [divisao, setDivisao] = useState<SaldoDivisaoGrupo | null>(null);
  const [divisaoCarregada, setDivisaoCarregada] = useState(false);
  const [orcamento, setOrcamento] = useState<PlanejadoVsRealCategoria[] | null>(
    null,
  );
  const [lancamentos, setLancamentos] = useState<Lancamento[] | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [naoAutenticado, setNaoAutenticado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pessoaFiltro, setPessoaFiltro] = useState("");

  useEffect(() => {
    let cancelado = false;
    const { inicio, fim } = primeiroEUltimoDiaDoMes(ano, mes);
    const pessoaQuery = pessoaFiltro ? `&pessoaId=${pessoaFiltro}` : "";

    Promise.all([
      fetch(`/api/relatorios/saldo?ano=${ano}${pessoaQuery}`),
      // Acumulado de todo o período registrado até o fim do mês selecionado
      // (não só o mês em si) — dívidas de meses anteriores continuam
      // aparecendo até serem quitadas.
      fetch(`/api/relatorios/divisao?dataFim=${fim}`),
      fetch(`/api/relatorios/planejado-vs-real?ano=${ano}${pessoaQuery}`),
      fetch(`/api/lancamentos?dataInicio=${inicio}&dataFim=${fim}${pessoaQuery}`),
      fetch("/api/pessoas"),
      fetch("/api/categorias"),
    ])
      .then(async (responses) => {
        if (cancelado) return;
        const [
          saldoRes,
          divisaoRes,
          orcamentoRes,
          lancamentosRes,
          pessoasRes,
          categoriasRes,
        ] = responses;

        if (
          saldoRes.status === 401 ||
          orcamentoRes.status === 401 ||
          lancamentosRes.status === 401 ||
          pessoasRes.status === 401 ||
          categoriasRes.status === 401
        ) {
          setNaoAutenticado(true);
          return;
        }

        setSaldo(saldoRes.ok ? await saldoRes.json() : null);
        setOrcamento(orcamentoRes.ok ? await orcamentoRes.json() : []);
        setLancamentos(
          unicosPorId(lancamentosRes.ok ? await lancamentosRes.json() : []),
        );
        setPessoas(unicosPorId(pessoasRes.ok ? await pessoasRes.json() : []));
        setCategorias(
          unicosPorId(categoriasRes.ok ? await categoriasRes.json() : []),
        );

        setDivisao(divisaoRes.ok ? await divisaoRes.json() : null);
        setDivisaoCarregada(true);
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar a visão geral.");
      });

    return () => {
      cancelado = true;
    };
  }, [ano, mes, pessoaFiltro]);

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado —{" "}
        <Link
          href="/login"
          className="text-primary font-medium hover:underline"
        >
          faça login
        </Link>{" "}
        para ver a visão geral.
      </p>
    );
  }

  const nomePessoa = (id: string) =>
    pessoas.find((p) => p.id === id)?.nome ?? "—";
  const nomeCategoria = (id: string | null) =>
    categorias.find((c) => c.id === id)?.nome ?? "Sem categoria";

  const saldoDoMes = saldo?.porMes.find((m) => m.mes === mes) ?? null;

  const totaisPorCategoria = new Map<
    string,
    { categoriaId: string; planejadoCentavos: number; realCentavos: number }
  >();
  for (const c of orcamento ?? []) {
    const doMes = c.meses.find((m) => m.mes === mes) ?? {
      planejadoCentavos: 0,
      realCentavos: 0,
    };
    const acumulado = totaisPorCategoria.get(c.categoriaId) ?? {
      categoriaId: c.categoriaId,
      planejadoCentavos: 0,
      realCentavos: 0,
    };
    acumulado.planejadoCentavos += doMes.planejadoCentavos;
    acumulado.realCentavos += doMes.realCentavos;
    totaisPorCategoria.set(c.categoriaId, acumulado);
  }
  const categoriasOrcamento = Array.from(totaisPorCategoria.values())
    .filter((c) => c.planejadoCentavos > 0 || c.realCentavos > 0)
    .sort((a, b) => {
      const percentualA =
        a.planejadoCentavos > 0
          ? a.realCentavos / a.planejadoCentavos
          : Infinity;
      const percentualB =
        b.planejadoCentavos > 0
          ? b.realCentavos / b.planejadoCentavos
          : Infinity;
      return percentualB - percentualA;
    });
  const totalPlanejadoCentavos = categoriasOrcamento.reduce(
    (soma, c) => soma + c.planejadoCentavos,
    0,
  );
  const totalRealCentavos = categoriasOrcamento.reduce(
    (soma, c) => soma + c.realCentavos,
    0,
  );

  const transacoesRecentes = (lancamentos ?? []).slice(0, 5);

  const cardClass =
    "flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg shadow-sm";
  const cardTitleClass =
    "text-xs font-semibold uppercase tracking-wide text-on-surface-variant";
  const linkClass = "mt-auto text-sm font-medium text-primary hover:underline";

  return (
    <div className="gap-lg flex flex-col">
      <div className="flex items-center gap-2">
        <label
          htmlFor="pessoaFiltro"
          className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase"
        >
          Visualizando
        </label>
        <select
          id="pessoaFiltro"
          value={pessoaFiltro}
          onChange={(e) => setPessoaFiltro(e.target.value)}
          className="border-outline-variant bg-surface-container-lowest text-on-surface px-md rounded-full border py-1.5 text-sm font-semibold"
        >
          <option value="">Geral</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      {erro && (
        <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
          {erro}
        </p>
      )}

      <div className="gap-md grid grid-cols-1 lg:grid-cols-3">
        <div className={`${cardClass} lg:col-span-2`}>
          <h2 className={cardTitleClass}>Resumo do mês</h2>
          <div className="gap-sm grid grid-cols-1 sm:grid-cols-3">
            <div>
              <p className="text-on-surface-variant text-xs">Receita total</p>
              <p className="data-tabular text-on-surface text-2xl font-semibold">
                {saldoDoMes ? centavosParaReais(saldoDoMes.receitaCentavos) : "—"}
              </p>
            </div>
            <div>
              <p className="text-on-surface-variant text-xs">Gastos totais</p>
              <p className="data-tabular text-on-surface text-2xl font-semibold">
                {saldoDoMes ? centavosParaReais(saldoDoMes.despesaCentavos) : "—"}
              </p>
            </div>
            <div>
              <p className="text-on-surface-variant text-xs">Saldo do mês</p>
              <p
                className={`data-tabular text-2xl font-semibold ${saldoDoMes && saldoDoMes.saldoCentavos < 0
                    ? "text-danger"
                    : "text-on-surface"
                  }`}
              >
                {saldoDoMes ? centavosParaReais(saldoDoMes.saldoCentavos) : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="gap-md bg-primary p-lg text-on-primary flex flex-col justify-between rounded-xl shadow-sm">
          <h2 className="text-on-primary/70 text-center text-xs font-semibold tracking-wide uppercase">
            Acerto de contas
          </h2>
          {!divisaoCarregada ? (
            <p className="text-on-primary/80 text-center text-sm">
              Carregando…
            </p>
          ) : !divisao ? (
            <p className="text-on-primary/90 text-center text-sm">
              Cadastre pelo menos duas pessoas do tipo Individual em{" "}
              <Link href="/pessoas" className="font-semibold underline">
                Pessoas
              </Link>{" "}
              para calcular o acerto de contas.
            </p>
          ) : divisao.transferenciasSugeridas.length === 0 ? (
            <>
              <div className="gap-md flex items-center justify-center">
                {divisao.participantes.slice(0, 2).map((id, i) => (
                  <span
                    key={id}
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${i === 0
                        ? "bg-tertiary-container text-on-tertiary-container"
                        : "bg-secondary text-on-secondary"
                      }`}
                  >
                    {nomePessoa(id).charAt(0).toUpperCase()}
                  </span>
                ))}
              </div>
              <p className="text-on-primary/90 text-center text-sm">
                Saldo zerado.
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-2 text-center">
              {divisao.transferenciasSugeridas.slice(0, 2).map((t, i) => (
                <p key={i} className="text-lg font-bold">
                  {nomePessoa(t.deId)} deve {centavosParaReais(t.valorCentavos)}
                </p>
              ))}
              {divisao.transferenciasSugeridas.length > 2 && (
                <p className="text-on-primary/70 text-sm">
                  +{divisao.transferenciasSugeridas.length - 2} outra(s)
                  pendência(s)
                </p>
              )}
              <p className="text-on-primary/70 text-sm">
                Para equilibrar os gastos compartilhados
              </p>
            </div>
          )}
          <Link
            href="/divisao"
            className="bg-on-primary/10 px-md py-sm hover:bg-on-primary/20 rounded-xl text-center text-sm font-semibold"
          >
            Ver detalhes
          </Link>
        </div>
      </div>

      <div className="gap-md grid grid-cols-1 lg:grid-cols-3">
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <h2 className={cardTitleClass}>Orçamento do mês</h2>
            <Link
              href="/orcamento"
              className="text-primary text-xs font-medium hover:underline"
            >
              Ver tudo
            </Link>
          </div>
          {categoriasOrcamento.length > 0 ? (
            <div className="gap-md flex flex-col">
              {categoriasOrcamento.map((c) => {
                const estourou =
                  c.realCentavos > c.planejadoCentavos &&
                  c.planejadoCentavos > 0;
                const percentual =
                  c.planejadoCentavos > 0
                    ? Math.min(
                      (c.realCentavos / c.planejadoCentavos) * 100,
                      100,
                    )
                    : 100;
                return (
                  <div key={c.categoriaId} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-on-surface">
                        {nomeCategoria(c.categoriaId)}
                      </span>
                      <span
                        className={`data-tabular text-xs font-medium ${estourou ? "text-danger" : "text-on-surface-variant"
                          }`}
                      >
                        {centavosParaReais(c.realCentavos)} /{" "}
                        {centavosParaReais(c.planejadoCentavos)}
                      </span>
                    </div>
                    <div className="bg-surface-container h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full ${estourou ? "bg-danger" : "bg-primary"}`}
                        style={{ width: `${percentual}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm">
              Nenhum orçamento planejado para este mês.
            </p>
          )}
          <div className="bg-surface-container-low p-sm mt-auto flex items-center justify-between rounded-lg text-sm">
            <span className="text-on-surface-variant">
              Total planejado: {centavosParaReais(totalPlanejadoCentavos)}
            </span>
            <span
              className={`data-tabular font-semibold ${totalPlanejadoCentavos - totalRealCentavos < 0
                  ? "text-danger"
                  : "text-on-surface"
                }`}
            >
              Saldo:{" "}
              {centavosParaReais(totalPlanejadoCentavos - totalRealCentavos)}
            </span>
          </div>
        </div>

        <div className={`${cardClass} lg:col-span-2`}>
          <div className="flex items-center justify-between">
            <h2 className={cardTitleClass}>Transações recentes</h2>
          </div>
          {transacoesRecentes.length > 0 ? (
            <div className="divide-outline-variant/60 flex flex-col divide-y">
              <div className="gap-sm pb-sm text-on-surface-variant grid grid-cols-5 text-xs font-semibold tracking-wide uppercase">
                <span>Data</span>
                <span>Descrição</span>
                <span>Pagador</span>
                <span>Divisão</span>
                <span className="justify-self-end">Valor</span>
              </div>
              {transacoesRecentes.map((l) => (
                <div
                  key={l.id}
                  className="gap-sm py-sm grid grid-cols-5 items-center text-sm"
                >
                  <span className="text-on-surface-variant">
                    {new Date(l.data).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                  <span className="text-on-surface truncate">
                    {l.descricaoPropria || l.descricaoOrigem || "—"}
                  </span>
                  <span className="bg-surface-container px-sm text-on-surface-variant justify-self-start rounded-full py-0.5 text-xs font-semibold">
                    {nomePessoa(l.pessoaPagouId)}
                  </span>
                  <span className="bg-surface-container px-sm text-on-surface-variant justify-self-start rounded-full py-0.5 text-xs font-semibold">
                    {nomePessoa(l.pessoaDivisaoId)}
                  </span>
                  <span className="data-tabular text-on-surface justify-self-end font-semibold">
                    {centavosParaReais(valorLiquidoCentavos(l))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm">
              Nenhum lançamento neste mês.
            </p>
          )}
          <Link href="/lancamentos" className={linkClass}>
            Ver extrato completo →
          </Link>
        </div>
      </div>
    </div>
  );
}
