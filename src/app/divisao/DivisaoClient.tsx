"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Pessoa = { id: string; nome: string; tipo: string };
type SaldoPessoa = { pessoaId: string; saldoCentavos: number };
type Transferencia = { deId: string; paraId: string; valorCentavos: number };
type SaldoDivisaoGrupo = {
  participantes: string[];
  saldosPorPessoa: SaldoPessoa[];
  transferenciasSugeridas: Transferencia[];
};

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function primeiroDiaDoMes(): string {
  const hoje = new Date();
  return formatarData(
    new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)),
  );
}

function ultimoDiaDoMes(): string {
  const hoje = new Date();
  return formatarData(
    new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)),
  );
}

function centavosParaReais(valor: number): string {
  return (valor / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function DivisaoClient() {
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes());
  const [dataFim, setDataFim] = useState(ultimoDiaDoMes());
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [saldo, setSaldo] = useState<SaldoDivisaoGrupo | null>(null);
  const [buscou, setBuscou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [naoAutenticado, setNaoAutenticado] = useState(false);

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
          setSaldo(null);
          return;
        }
        setErro(null);
        setSaldo(await response.json());
        setBuscou(true);
      })
      .catch(() => {
        if (!cancelado)
          setErro("Não foi possível calcular o acerto de contas.");
      });
    return () => {
      cancelado = true;
    };
  }, [dataInicio, dataFim]);

  const nomePorId = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of pessoas) mapa.set(p.id, p.nome);
    return mapa;
  }, [pessoas]);

  function nome(id: string): string {
    return nomePorId.get(id) ?? id;
  }

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para ver o acerto de contas.
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
      </div>

      {buscou && saldo === null && (
        <p className="border-outline-variant bg-surface-container-lowest p-lg text-on-surface-variant rounded-xl border text-sm">
          É preciso cadastrar pelo menos duas pessoas do tipo Individual em{" "}
          <Link
            href="/pessoas"
            className="text-primary font-medium hover:underline"
          >
            Pessoas
          </Link>{" "}
          para calcular o acerto de contas. Uma casa com uma única pessoa não
          tem o que dividir.
        </p>
      )}

      {saldo && (
        <div className="gap-lg flex flex-col">
          <div className="border-outline-variant bg-surface-container-lowest p-lg rounded-xl border text-center">
            {saldo.transferenciasSugeridas.length === 0 ? (
              <p className="text-on-surface text-lg font-semibold">
                Contas quitadas 🎉
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {saldo.transferenciasSugeridas.map((t, i) => (
                  <p key={i} className="text-on-surface text-lg font-semibold">
                    {nome(t.deId)} deve {centavosParaReais(t.valorCentavos)}{" "}
                    para {nome(t.paraId)}
                  </p>
                ))}
              </div>
            )}
          </div>

          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-outline-variant text-on-surface-variant border-b text-xs font-semibold tracking-wide uppercase">
                <th className="p-2 text-left">Pessoa</th>
                <th className="p-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {saldo.saldosPorPessoa.map((s) => (
                <tr
                  key={s.pessoaId}
                  className="border-outline-variant/60 border-b"
                >
                  <td className="p-2">{nome(s.pessoaId)}</td>
                  <td
                    className={`p-2 text-right font-medium ${
                      s.saldoCentavos > 0
                        ? "text-success"
                        : s.saldoCentavos < 0
                          ? "text-danger"
                          : "text-on-surface"
                    }`}
                  >
                    {s.saldoCentavos > 0 && "+"}
                    {centavosParaReais(s.saldoCentavos)}
                    <span className="text-on-surface-variant ml-1 text-xs font-normal">
                      {s.saldoCentavos > 0
                        ? "a receber"
                        : s.saldoCentavos < 0
                          ? "deve"
                          : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
