"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { RelatorioInvestimentos } from "./RelatorioInvestimentos";
import { PosicaoMensalInline } from "./PosicaoMensalInline";
import { FinalizarInvestimentoModal } from "./FinalizarInvestimentoModal";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { ColumnHeader } from "../components/ColumnHeader";
import { useTabela, type ColunaTabela } from "../components/useTabela";

export const TIPOS_INVESTIMENTO = [
  { value: "RENDA_FIXA", label: "Renda Fixa" },
  { value: "FUNDO", label: "Fundo de Investimento" },
  { value: "FGTS", label: "FGTS" },
  { value: "OUTRO", label: "Outro" },
] as const;

export type TipoInvestimento = (typeof TIPOS_INVESTIMENTO)[number]["value"];

export function labelTipo(tipo: string): string {
  return TIPOS_INVESTIMENTO.find((t) => t.value === tipo)?.label ?? tipo;
}

const FAIXAS_LABEL: Record<string, string> = {
  IMEDIATO: "Imediato (D+0)",
  ATE_30_DIAS: "Até 30 dias",
  ATE_90_DIAS: "Até 90 dias",
  ATE_180_DIAS: "Até 180 dias",
  ATE_365_DIAS: "Até 1 ano",
  MAIS_DE_1_ANO: "Mais de 1 ano",
  INDEFINIDO: "Sem prazo definido",
};

export type Banco = { id: string; nome: string; ativo: boolean };
export type Pessoa = { id: string; nome: string; tipo: string };
export type Investimento = {
  id: string;
  bancoId: string;
  tipo: TipoInvestimento;
  produto: string;
  valorAtualCentavos: number;
  vencimento: string | null;
  liquidezDias: number | null;
  observacao: string | null;
  pessoaId: string;
  status: "ATIVO" | "FINALIZADO";
};
type FaixaLiquidez = {
  faixa: string;
  totalCentavos: number;
  investimentos: { id: string; produto: string; valorAtualCentavos: number }[];
};
type PosicaoMensal = {
  investimentoId: string;
  mes: string;
  valorCentavos: number;
};

export async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível completar a operação.";
}

export function reaisParaCentavos(valor: string): number {
  const n = Number(valor.replace(",", "."));
  return Math.round(n * 100);
}

export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function labelVencimento(inv: Investimento): string {
  if (inv.liquidezDias !== null) return `D+${inv.liquidezDias}`;
  if (inv.vencimento)
    return new Date(inv.vencimento).toLocaleDateString("pt-BR", {
      timeZone: "UTC",
    });
  return "Indefinido";
}

type FormState = {
  bancoId: string;
  pessoaId: string;
  tipo: TipoInvestimento;
  produto: string;
  valor: string;
  modoLiquidez: "DIAS" | "DATA" | "NENHUM";
  liquidezDias: string;
  vencimento: string;
  observacao: string;
};

function IconePlusCirculo() {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

function IconeFinalizar() {
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
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconeChevron({ aberto }: { aberto: boolean }) {
  return (
    <svg
      className={`text-on-surface-variant h-4 w-4 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function formVazio(bancos: Banco[], pessoas: Pessoa[]): FormState {
  return {
    bancoId: bancos[0]?.id ?? "",
    pessoaId: pessoas[0]?.id ?? "",
    tipo: "RENDA_FIXA",
    produto: "",
    valor: "",
    modoLiquidez: "DIAS",
    liquidezDias: "0",
    vencimento: "",
    observacao: "",
  };
}

export function InvestimentosClient() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [investimentos, setInvestimentos] = useState<Investimento[] | null>(
    null,
  );
  const [liquidez, setLiquidez] = useState<FaixaLiquidez[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [naoAutenticado, setNaoAutenticado] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [aba, setAba] = useState<"CARTEIRA" | "RELATORIOS">("RELATORIOS");
  const [toast, setToast] = useState<string | null>(null);
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);
  const [investimentoParaFinalizar, setInvestimentoParaFinalizar] =
    useState<Investimento | null>(null);
  const { dialog: dialogConfirmacao } = useConfirmDialog();

  const anoAtual = new Date().getUTCFullYear();
  const [investimentoExpandidoId, setInvestimentoExpandidoId] = useState<
    string | null
  >(null);
  const [anoPosicoes, setAnoPosicoes] = useState(anoAtual);
  const [posicoesMensais, setPosicoesMensais] = useState<PosicaoMensal[]>([]);
  const [reloadPosicoesToken, setReloadPosicoesToken] = useState(0);

  function recarregar() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      fetch("/api/bancos").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/pessoas").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([bcs, pes]) => {
        if (cancelado) return;
        if (bcs === null || pes === null) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        setBancos(bcs);
        setPessoas(pes);
        setForm((atual) => atual ?? formVazio(bcs, pes));
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar bancos/pessoas.");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    const query = mostrarFinalizados ? "?incluirFinalizados=true" : "";
    Promise.all([
      fetch(`/api/investimentos${query}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/investimentos/liquidez").then((r) =>
        r.ok ? r.json() : null,
      ),
    ])
      .then(([invs, liq]) => {
        if (cancelado) return;
        if (invs === null || liq === null) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        setInvestimentos(invs);
        setLiquidez(liq);
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar investimentos.");
      });
    return () => {
      cancelado = true;
    };
  }, [reloadToken, mostrarFinalizados]);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/investimentos/posicoes?ano=${anoPosicoes}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((dados) => {
        if (!cancelado) setPosicoesMensais(dados);
      })
      .catch(() => {
        if (!cancelado) setPosicoesMensais([]);
      });
    return () => {
      cancelado = true;
    };
  }, [anoPosicoes, reloadPosicoesToken]);

  async function criarInvestimento(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setErro(null);

    const response = await fetch("/api/investimentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bancoId: form.bancoId,
        pessoaId: form.pessoaId,
        tipo: form.tipo,
        produto: form.produto,
        valorAtualCentavos: reaisParaCentavos(form.valor || "0"),
        liquidezDias:
          form.modoLiquidez === "DIAS" ? Number(form.liquidezDias) : null,
        vencimento: form.modoLiquidez === "DATA" ? form.vencimento : null,
        observacao: form.observacao.trim() === "" ? null : form.observacao,
      }),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    setForm(formVazio(bancos, pessoas));
    setToast("Investimento adicionado com sucesso!");
    recarregar();
  }

  function onInvestimentoFinalizado() {
    setInvestimentoParaFinalizar(null);
    setToast("Investimento finalizado com sucesso!");
    recarregar();
  }

  const bancosPorId = useMemo(
    () => new Map(bancos.map((b) => [b.id, b])),
    [bancos],
  );
  const pessoasPorId = useMemo(
    () => new Map(pessoas.map((p) => [p.id, p])),
    [pessoas],
  );

  const colunasInvestimentos = useMemo<ColunaTabela<Investimento>[]>(
    () => [
      {
        chave: "banco",
        tipo: "opcoes",
        acessor: (inv) => bancosPorId.get(inv.bancoId)?.nome ?? "—",
      },
      { chave: "tipo", tipo: "opcoes", acessor: (inv) => labelTipo(inv.tipo) },
      { chave: "produto", tipo: "texto", acessor: (inv) => inv.produto },
      {
        chave: "titular",
        tipo: "opcoes",
        acessor: (inv) => pessoasPorId.get(inv.pessoaId)?.nome ?? "—",
      },
      {
        chave: "vencimento",
        tipo: "texto",
        acessor: (inv) => labelVencimento(inv),
      },
      {
        chave: "valor",
        tipo: "numero",
        acessor: (inv) => inv.valorAtualCentavos / 100,
      },
    ],
    [bancosPorId, pessoasPorId],
  );

  const {
    linhas: investimentosParaExibir,
    ordenacao,
    alternarOrdenacao,
    filtros,
    definirFiltro,
    limparFiltro,
  } = useTabela(investimentos ?? [], colunasInvestimentos);

  const opcoesColunasInvestimentos = useMemo(() => {
    const base = investimentos ?? [];
    const unicos = (valores: string[]) =>
      [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      banco: unicos(base.map((inv) => bancosPorId.get(inv.bancoId)?.nome ?? "—")),
      tipo: unicos(base.map((inv) => labelTipo(inv.tipo))),
      titular: unicos(
        base.map((inv) => pessoasPorId.get(inv.pessoaId)?.nome ?? "—"),
      ),
    };
  }, [investimentos, bancosPorId, pessoasPorId]);

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para gerenciar investimentos.
      </p>
    );
  }

  const cardClass =
    "rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm";
  const inputClass =
    "rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-1.5 text-sm focus:border-primary focus:outline-none";

  return (
    <div className="gap-lg flex flex-col">
      {dialogConfirmacao}

      {investimentoParaFinalizar && (
        <FinalizarInvestimentoModal
          investimento={investimentoParaFinalizar}
          bancos={bancos}
          onClose={() => setInvestimentoParaFinalizar(null)}
          onFinalizado={onInvestimentoFinalizado}
        />
      )}

      {toast && (
        <div className="bottom-lg right-lg bg-primary px-md text-on-primary fixed z-50 flex items-center gap-2 rounded-xl py-2.5 text-sm font-medium shadow-lg">
          <span aria-hidden>✓</span> {toast}
        </div>
      )}

      {erro && (
        <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
          {erro}
        </p>
      )}

      <nav className="gap-sm border-outline-variant flex items-center border-b">
        {(
          [
            { value: "RELATORIOS", label: "Relatórios" },
            { value: "CARTEIRA", label: "Carteira" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setAba(tab.value)}
            className={
              aba === tab.value
                ? "border-primary text-on-surface border-b-2 px-1 pb-2 text-sm font-semibold"
                : "text-on-surface-variant hover:text-on-surface px-1 pb-2 text-sm font-medium"
            }
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {aba === "RELATORIOS" && (
        <RelatorioInvestimentos
          investimentos={investimentos ?? []}
          bancos={bancos}
          pessoas={pessoas}
        />
      )}

      {aba === "CARTEIRA" && form && (
        <div className={`${cardClass} p-lg`}>
          <div className="mb-md border-outline-variant pb-md text-on-surface flex items-center gap-2 border-b">
            <IconePlusCirculo />
            <h2 className="text-base font-bold">Registrar Novo Investimento</h2>
          </div>
          <form
            onSubmit={criarInvestimento}
            className="gap-sm flex flex-wrap items-end"
          >
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="banco"
              >
                Banco
              </label>
              <select
                id="banco"
                className={inputClass}
                value={form.bancoId}
                onChange={(e) => setForm({ ...form, bancoId: e.target.value })}
                required
              >
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="titular"
              >
                Titular
              </label>
              <select
                id="titular"
                className={inputClass}
                value={form.pessoaId}
                onChange={(e) => setForm({ ...form, pessoaId: e.target.value })}
                required
              >
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="tipo"
              >
                Tipo
              </label>
              <select
                id="tipo"
                className={inputClass}
                value={form.tipo}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tipo: e.target.value as TipoInvestimento,
                  })
                }
              >
                {TIPOS_INVESTIMENTO.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="produto"
              >
                Produto
              </label>
              <input
                id="produto"
                className={inputClass}
                value={form.produto}
                onChange={(e) => setForm({ ...form, produto: e.target.value })}
                required
              />
            </div>

            <div className="flex flex-col gap-3">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="valor"
              >
                Valor atual (R$)
              </label>
              <input
                id="valor"
                type="number"
                step="0.01"
                placeholder="0,00"
                className={`w-32 text-right ${inputClass}`}
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="modo-liquidez"
              >
                Vencimento/liquidez
              </label>
              <select
                id="modo-liquidez"
                className={inputClass}
                value={form.modoLiquidez}
                onChange={(e) =>
                  setForm({
                    ...form,
                    modoLiquidez: e.target.value as FormState["modoLiquidez"],
                  })
                }
              >
                <option value="DIAS">Prazo (D+n)</option>
                <option value="DATA">Data de vencimento</option>
                <option value="NENHUM">Indefinido</option>
              </select>
            </div>

            {form.modoLiquidez === "DIAS" && (
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="liquidez-dias"
                >
                  Dias (D+n)
                </label>
                <input
                  id="liquidez-dias"
                  type="number"
                  min={0}
                  className={`w-24 ${inputClass}`}
                  value={form.liquidezDias}
                  onChange={(e) =>
                    setForm({ ...form, liquidezDias: e.target.value })
                  }
                />
              </div>
            )}

            {form.modoLiquidez === "DATA" && (
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="vencimento"
                >
                  Data
                </label>
                <input
                  id="vencimento"
                  type="date"
                  className={inputClass}
                  value={form.vencimento}
                  onChange={(e) =>
                    setForm({ ...form, vencimento: e.target.value })
                  }
                  required
                />
              </div>
            )}

            <div className="flex min-w-[180px] flex-1 flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="observacao"
              >
                Observação (Opcional)
              </label>
              <input
                id="observacao"
                className={inputClass}
                value={form.observacao}
                onChange={(e) =>
                  setForm({ ...form, observacao: e.target.value })
                }
              />
            </div>

            <button
              type="submit"
              className="bg-primary px-md text-on-primary rounded-full py-2 text-xs font-semibold hover:opacity-90"
            >
              Adicionar
            </button>
          </form>
        </div>
      )}

      {aba === "CARTEIRA" && (
        <div className={cardClass}>
          <div className="gap-md p-lg pb-md flex flex-wrap items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-on-surface text-base font-bold">Carteira</h2>
              <span className="bg-surface-container px-sm text-on-surface-variant rounded-full py-0.5 text-xs font-semibold">
                {investimentos?.length ?? 0}{" "}
                {investimentos?.length === 1
                  ? "item cadastrado"
                  : "itens cadastrados"}
              </span>
            </div>
            <div className="gap-md flex items-center">
              <label className="gap-1.5 text-on-surface-variant flex cursor-pointer items-center text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={mostrarFinalizados}
                  onChange={(e) => setMostrarFinalizados(e.target.checked)}
                />
                Mostrar finalizados
              </label>
              <div className="gap-sm flex items-center">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="ano-posicoes"
                >
                  Posições do ano
                </label>
                <select
                  id="ano-posicoes"
                  className="border-outline-variant bg-surface-container-lowest rounded-lg border px-2 py-1 text-sm"
                  value={anoPosicoes}
                  onChange={(e) => setAnoPosicoes(Number(e.target.value))}
                >
                  {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <p className="text-on-surface-variant px-lg pb-md text-xs">
            Clique em um investimento para informar a posição mês a mês.
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-outline-variant text-on-surface-variant border-y text-xs font-semibold tracking-wide uppercase">
                  <th className="p-md text-left"></th>
                  <ColumnHeader
                    label="Banco"
                    chave="banco"
                    tipo="opcoes"
                    opcoes={opcoesColunasInvestimentos.banco}
                    ordenacao={ordenacao}
                    onOrdenar={alternarOrdenacao}
                    filtro={filtros.banco}
                    onFiltrar={definirFiltro}
                    onLimparFiltro={limparFiltro}
                  />
                  <ColumnHeader
                    label="Tipo"
                    chave="tipo"
                    tipo="opcoes"
                    opcoes={opcoesColunasInvestimentos.tipo}
                    ordenacao={ordenacao}
                    onOrdenar={alternarOrdenacao}
                    filtro={filtros.tipo}
                    onFiltrar={definirFiltro}
                    onLimparFiltro={limparFiltro}
                  />
                  <ColumnHeader
                    label="Produto"
                    chave="produto"
                    tipo="texto"
                    ordenacao={ordenacao}
                    onOrdenar={alternarOrdenacao}
                    filtro={filtros.produto}
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
                    label="Vencimento/liquidez"
                    chave="vencimento"
                    tipo="texto"
                    ordenacao={ordenacao}
                    onOrdenar={alternarOrdenacao}
                    filtro={filtros.vencimento}
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
                  <th className="p-md text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {investimentosParaExibir.map((inv) => {
                  const banco = bancos.find((b) => b.id === inv.bancoId);
                  const pessoa = pessoas.find((p) => p.id === inv.pessoaId);
                  const expandido = investimentoExpandidoId === inv.id;
                  return (
                    <Fragment key={inv.id}>
                      <tr
                        onClick={() =>
                          setInvestimentoExpandidoId(expandido ? null : inv.id)
                        }
                        aria-expanded={expandido}
                        className="border-outline-variant/60 hover:bg-surface-container-low cursor-pointer border-b"
                      >
                        <td className="p-md">
                          <IconeChevron aberto={expandido} />
                        </td>
                        <td className="p-md text-on-surface-variant">
                          {banco?.nome ?? "—"}
                        </td>
                        <td className="p-md text-on-surface-variant">
                          {labelTipo(inv.tipo)}
                        </td>
                        <td className="p-md">
                          <div className="text-on-surface flex items-center gap-2 font-medium">
                            {inv.produto}
                            {inv.status === "FINALIZADO" && (
                              <span className="bg-surface-container-high text-on-surface-variant rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase">
                                Finalizado
                              </span>
                            )}
                          </div>
                          {inv.observacao && (
                            <div className="text-on-surface-variant text-xs">
                              {inv.observacao}
                            </div>
                          )}
                        </td>
                        <td className="p-md text-on-surface-variant">
                          {pessoa?.nome ?? "—"}
                        </td>
                        <td className="p-md text-on-surface-variant whitespace-nowrap">
                          {labelVencimento(inv)}
                        </td>
                        <td className="data-tabular p-md text-right font-medium">
                          {formatarReais(inv.valorAtualCentavos)}
                        </td>
                        <td className="p-md">
                          <div className="flex justify-end">
                            {inv.status === "ATIVO" && (
                              <button
                                className="text-primary hover:bg-primary-container rounded-full p-1.5 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInvestimentoParaFinalizar(inv);
                                }}
                                title="Finalizar"
                                aria-label="Finalizar"
                              >
                                <IconeFinalizar />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandido && (
                        <tr className="border-outline-variant/60 bg-surface-container-low border-b">
                          <td colSpan={8} className="p-0">
                            <PosicaoMensalInline
                              investimentoId={inv.id}
                              ano={anoPosicoes}
                              posicoes={posicoesMensais}
                              onAlterado={() =>
                                setReloadPosicoesToken((t) => t + 1)
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {investimentosParaExibir.length === 0 && (
            <p className="p-lg text-on-surface-variant text-sm">
              {investimentos?.length === 0
                ? "Nenhum investimento cadastrado."
                : "Nenhum investimento corresponde aos filtros das colunas."}
            </p>
          )}
        </div>
      )}

      {aba === "CARTEIRA" && (
        <div className={cardClass}>
          <div className="p-lg pb-md">
            <h2 className="text-on-surface text-base font-bold">
              Liquidez consolidada (RF15)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-outline-variant text-on-surface-variant border-y text-xs font-semibold tracking-wide uppercase">
                  <th className="p-md text-left">Prazo de resgate</th>
                  <th className="p-md text-right">Total disponível</th>
                </tr>
              </thead>
              <tbody>
                {liquidez?.map((grupo) => (
                  <tr
                    key={grupo.faixa}
                    className="border-outline-variant/60 hover:bg-surface-container-low border-b"
                  >
                    <td className="p-md text-on-surface-variant">
                      {FAIXAS_LABEL[grupo.faixa] ?? grupo.faixa}
                    </td>
                    <td className="data-tabular p-md text-right font-medium">
                      {formatarReais(grupo.totalCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
