"use client";

import { useEffect, useMemo, useState } from "react";

type Subcategoria = { id: string; nome: string };
type Categoria = { id: string; nome: string; subcategorias: Subcategoria[] };
type Banco = { id: string; nome: string };
type Pessoa = { id: string; nome: string };

type Lancamento = {
  id: string;
  data: string;
  descricaoPropria: string | null;
  descricaoOrigem: string | null;
  valorCentavos: number;
  descontoCentavos: number;
  categoriaId: string | null;
  subcategoriaId: string | null;
  bancoId: string;
  pessoaDivisaoId: string;
  pessoaPagouId: string;
};

function csvEscape(valor: string): string {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

function centavosParaReais(valor: number): string {
  return (valor / 100).toFixed(2);
}

function baixarCsv(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([`﻿${conteudo}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportarDadosClient() {
  const [lancamentos, setLancamentos] = useState<Lancamento[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [naoAutenticado, setNaoAutenticado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      fetch("/api/lancamentos").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/categorias").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/bancos").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/pessoas").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([lan, cats, bcs, pes]) => {
        if (cancelado) return;
        if (lan === null || cats === null || bcs === null || pes === null) {
          setNaoAutenticado(true);
          return;
        }
        setLancamentos(lan);
        setCategorias(cats);
        setBancos(bcs);
        setPessoas(pes);
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar os dados para exportação.");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const nome = useMemo(() => {
    const mapaBancos = new Map(bancos.map((b) => [b.id, b.nome]));
    const mapaPessoas = new Map(pessoas.map((p) => [p.id, p.nome]));
    const mapaCategorias = new Map(categorias.map((c) => [c.id, c.nome]));
    const mapaSubcategorias = new Map(
      categorias.flatMap((c) => c.subcategorias.map((s) => [s.id, s.nome])),
    );
    return {
      banco: (id: string) => mapaBancos.get(id) ?? "",
      pessoa: (id: string) => mapaPessoas.get(id) ?? "",
      categoria: (id: string | null) => (id ? (mapaCategorias.get(id) ?? "") : ""),
      subcategoria: (id: string | null) =>
        id ? (mapaSubcategorias.get(id) ?? "") : "",
    };
  }, [bancos, pessoas, categorias]);

  function exportarCsv() {
    if (!lancamentos) return;
    const cabecalho = [
      "Data",
      "Descrição",
      "Valor",
      "Desconto",
      "Categoria",
      "Subcategoria",
      "Banco",
      "Divisão",
      "Pagou",
    ];
    const linhas = lancamentos.map((l) =>
      [
        l.data.slice(0, 10),
        l.descricaoPropria ?? l.descricaoOrigem ?? "",
        centavosParaReais(l.valorCentavos),
        centavosParaReais(l.descontoCentavos),
        nome.categoria(l.categoriaId),
        nome.subcategoria(l.subcategoriaId),
        nome.banco(l.bancoId),
        nome.pessoa(l.pessoaDivisaoId),
        nome.pessoa(l.pessoaPagouId),
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
    const csv = [cabecalho.join(","), ...linhas].join("\n");
    const hoje = new Date().toISOString().slice(0, 10);
    baixarCsv(`lancamentos-${hoje}.csv`, csv);

    fetch("/api/atividades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "Exportou lançamentos (CSV)" }),
    }).catch(() => {});
  }

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para exportar dados.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger-container p-sm text-sm text-on-danger-container">
          {erro}
        </p>
      )}

      <div className="flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
        <div>
          <h2 className="text-base font-semibold text-on-surface">
            Exportar transações
          </h2>
          <p className="text-sm text-on-surface-variant">
            Baixe o histórico completo de lançamentos em formato compatível com
            planilhas (CSV).
          </p>
        </div>
        <button
          onClick={exportarCsv}
          disabled={!lancamentos}
          className="w-fit rounded-full bg-primary px-md py-1.5 text-xs font-semibold text-on-primary hover:opacity-90 disabled:opacity-50"
        >
          {lancamentos
            ? `Baixar CSV (${lancamentos.length} lançamentos)`
            : "Carregando…"}
        </button>
      </div>
    </div>
  );
}
