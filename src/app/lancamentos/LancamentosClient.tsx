"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PessoaBadge } from "../components/PessoaBadge";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { ColumnHeader } from "../components/ColumnHeader";
import { useTabela, type ColunaTabela } from "../components/useTabela";
import type { FiltroColuna } from "@/lib/domain/tabela";

type Subcategoria = { id: string; nome: string; categoriaId: string };
type Categoria = { id: string; nome: string; subcategorias: Subcategoria[] };
type Banco = { id: string; nome: string };
type Pessoa = { id: string; nome: string; tipo: string };
type Template = { id: string; nomeExibicao: string; descricao: string };
type Investimento = { id: string; produto: string };

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
  pagoComResgateInvestimento: boolean;
  investimentoResgateId: string | null;
};

type LinhaPreview = {
  numeroLinha: number;
  data: string;
  descricaoOrigem: string;
  valorCentavos: number;
  hash: string;
  duplicado: boolean;
  categoriaSugeridaId: string | null;
  subcategoriaSugeridaId: string | null;
};

type ErroImportacao = { numeroLinha: number; motivo: string };

type LinhaRevisao = LinhaPreview & {
  selecionada: boolean;
  categoriaId: string;
  subcategoriaId: string;
  pessoaDivisaoId: string;
};

async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível completar a operação.";
}

function centavosParaReais(valor: number): string {
  return (valor / 100).toFixed(2);
}

function reaisParaCentavos(valor: string): number {
  if (valor.trim() === "") return 0;
  const n = Number(valor.replace(",", "."));
  return Math.round(n * 100);
}

function dataParaInputDate(data: string): string {
  return data.slice(0, 10);
}

function formatarMoeda(valorCentavos: number): string {
  return Math.abs(valorCentavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const SEM_CATEGORIA = "";
const TAMANHO_PAGINA_REVISAO = 8;
const TAMANHO_PAGINA_LANCAMENTOS = 25;

type FormLancamento = {
  data: string;
  descricaoPropria: string;
  valor: string;
  desconto: string;
  categoriaId: string;
  subcategoriaId: string;
  bancoId: string;
  pessoaDivisaoId: string;
  pessoaPagouId: string;
  pagoComResgateInvestimento: boolean;
  investimentoResgateId: string;
};

function formVazio(defaults: {
  bancoId?: string;
  pessoaId?: string;
}): FormLancamento {
  return {
    data: new Date().toISOString().slice(0, 10),
    descricaoPropria: "",
    valor: "",
    desconto: "",
    categoriaId: SEM_CATEGORIA,
    subcategoriaId: SEM_CATEGORIA,
    bancoId: defaults.bancoId ?? "",
    pessoaDivisaoId: defaults.pessoaId ?? "",
    pessoaPagouId: defaults.pessoaId ?? "",
    pagoComResgateInvestimento: false,
    investimentoResgateId: "",
  };
}

export function LancamentosClient() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [investimentos, setInvestimentos] = useState<Investimento[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [naoAutenticado, setNaoAutenticado] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const { confirmar, dialog: dialogConfirmacao } = useConfirmDialog();

  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [filtroCategoriaId, setFiltroCategoriaId] = useState("");
  const [filtroBancoId, setFiltroBancoId] = useState("");
  const [filtroPessoaId, setFiltroPessoaId] = useState("");

  const [form, setForm] = useState<FormLancamento>(formVazio({}));

  // Importação / revisão em massa
  const [importBancoId, setImportBancoId] = useState("");
  const [importTemplateId, setImportTemplateId] = useState("");
  const [importPessoaDivisaoId, setImportPessoaDivisaoId] = useState("");
  const [importPessoaPagouId, setImportPessoaPagouId] = useState("");
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [linhasRevisao, setLinhasRevisao] = useState<LinhaRevisao[]>([]);
  const [errosImportacao, setErrosImportacao] = useState<ErroImportacao[]>([]);
  const [paginaRevisao, setPaginaRevisao] = useState(0);
  const [acoesEmMassaAberto, setAcoesEmMassaAberto] = useState(false);
  const [categoriaEmMassa, setCategoriaEmMassa] = useState("");
  const [paginaLancamentos, setPaginaLancamentos] = useState(0);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  function carregar() {
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
      fetch("/api/categorias").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/bancos").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/pessoas").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/importacao/templates").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/investimentos?incluirFinalizados=true").then((r) =>
        r.ok ? r.json() : null,
      ),
    ])
      .then(([cats, bcs, pes, tpls, invs]) => {
        if (cancelado) return;
        if (
          cats === null ||
          bcs === null ||
          pes === null ||
          tpls === null ||
          invs === null
        ) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        setCategorias(cats);
        setBancos(bcs);
        setPessoas(pes);
        setTemplates(tpls);
        setInvestimentos(invs);
        setForm((atual) =>
          atual.bancoId || atual.pessoaDivisaoId
            ? atual
            : formVazio({ bancoId: bcs[0]?.id, pessoaId: pes[0]?.id }),
        );
        setImportBancoId((atual) => atual || (bcs[0]?.id ?? ""));
        setImportPessoaDivisaoId((atual) => atual || (pes[0]?.id ?? ""));
        setImportPessoaPagouId((atual) => atual || (pes[0]?.id ?? ""));
      })
      .catch(() => {
        if (!cancelado)
          setErro("Não foi possível carregar categorias/bancos/pessoas.");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    const params = new URLSearchParams();
    if (filtroDataInicio) params.set("dataInicio", filtroDataInicio);
    if (filtroDataFim) params.set("dataFim", filtroDataFim);
    if (filtroCategoriaId) params.set("categoriaId", filtroCategoriaId);
    if (filtroBancoId) params.set("bancoId", filtroBancoId);
    if (filtroPessoaId) params.set("pessoaId", filtroPessoaId);

    fetch(`/api/lancamentos?${params.toString()}`)
      .then(async (response) => {
        if (cancelado) return;
        if (response.status === 401) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        setLancamentos(await response.json());
        setPaginaLancamentos(0);
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar os lançamentos.");
      });
    return () => {
      cancelado = true;
    };
  }, [
    filtroDataInicio,
    filtroDataFim,
    filtroCategoriaId,
    filtroBancoId,
    filtroPessoaId,
    reloadToken,
  ]);

  const nome = useMemo(() => {
    const mapaBancos = new Map(bancos.map((b) => [b.id, b.nome]));
    const mapaPessoas = new Map(pessoas.map((p) => [p.id, p.nome]));
    const mapaCategorias = new Map(categorias.map((c) => [c.id, c.nome]));
    const mapaSubcategorias = new Map(
      categorias.flatMap((c) => c.subcategorias.map((s) => [s.id, s.nome])),
    );
    return {
      banco: (id: string) => mapaBancos.get(id) ?? "—",
      pessoa: (id: string) => mapaPessoas.get(id) ?? "—",
      categoria: (id: string | null) =>
        id ? (mapaCategorias.get(id) ?? "—") : "—",
      subcategoria: (id: string | null) =>
        id ? (mapaSubcategorias.get(id) ?? "—") : "—",
    };
  }, [bancos, pessoas, categorias]);

  const pessoasPorId = useMemo(
    () => new Map(pessoas.map((p) => [p.id, p])),
    [pessoas],
  );

  const colunasLancamentos = useMemo<ColunaTabela<Lancamento>[]>(
    () => [
      {
        chave: "data",
        tipo: "data",
        acessor: (l) => dataParaInputDate(l.data),
      },
      {
        chave: "descricao",
        tipo: "texto",
        acessor: (l) => l.descricaoPropria || l.descricaoOrigem || "",
      },
      {
        chave: "valor",
        tipo: "numero",
        acessor: (l) => (l.valorCentavos - l.descontoCentavos) / 100,
      },
      {
        chave: "categoria",
        tipo: "opcoes",
        acessor: (l) => nome.categoria(l.categoriaId),
      },
      {
        chave: "subcategoria",
        tipo: "opcoes",
        acessor: (l) => nome.subcategoria(l.subcategoriaId),
      },
      { chave: "banco", tipo: "opcoes", acessor: (l) => nome.banco(l.bancoId) },
      {
        chave: "divisao",
        tipo: "opcoes",
        acessor: (l) => nome.pessoa(l.pessoaDivisaoId),
      },
      {
        chave: "pagou",
        tipo: "opcoes",
        acessor: (l) => nome.pessoa(l.pessoaPagouId),
      },
    ],
    [nome],
  );

  const {
    linhas: lancamentosProcessados,
    ordenacao,
    alternarOrdenacao,
    filtros,
    definirFiltro,
    limparFiltro,
  } = useTabela(lancamentos ?? [], colunasLancamentos);

  const lancamentoDetalhe = useMemo(
    () => (lancamentos ?? []).find((l) => l.id === detalheId) ?? null,
    [lancamentos, detalheId],
  );

  const opcoesColunas = useMemo(() => {
    const base = lancamentos ?? [];
    const unicos = (valores: string[]) =>
      [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      categoria: unicos(base.map((l) => nome.categoria(l.categoriaId))),
      subcategoria: unicos(
        base.map((l) => nome.subcategoria(l.subcategoriaId)),
      ),
      banco: unicos(base.map((l) => nome.banco(l.bancoId))),
      divisao: unicos(base.map((l) => nome.pessoa(l.pessoaDivisaoId))),
      pagou: unicos(base.map((l) => nome.pessoa(l.pessoaPagouId))),
    };
  }, [lancamentos, nome]);

  function aoOrdenarColuna(chave: string) {
    alternarOrdenacao(chave);
    setPaginaLancamentos(0);
  }

  function aoFiltrarColuna(chave: string, filtro: FiltroColuna) {
    definirFiltro(chave, filtro);
    setPaginaLancamentos(0);
  }

  function aoLimparFiltroColuna(chave: string) {
    limparFiltro(chave);
    setPaginaLancamentos(0);
  }

  const subcategoriasDaCategoriaSelecionada = useMemo(() => {
    return (
      categorias.find((c) => c.id === form.categoriaId)?.subcategorias ?? []
    );
  }, [categorias, form.categoriaId]);

  async function criarLancamento(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const response = await fetch("/api/lancamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: form.data,
        descricaoPropria: form.descricaoPropria || null,
        valorCentavos: reaisParaCentavos(form.valor),
        descontoCentavos: reaisParaCentavos(form.desconto),
        categoriaId: form.categoriaId || null,
        subcategoriaId: form.subcategoriaId || null,
        bancoId: form.bancoId,
        pessoaDivisaoId: form.pessoaDivisaoId,
        pessoaPagouId: form.pessoaPagouId,
        pagoComResgateInvestimento: form.pagoComResgateInvestimento,
        investimentoResgateId: form.investimentoResgateId || null,
      }),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    setForm((atual) => ({
      ...formVazio({ bancoId: atual.bancoId, pessoaId: atual.pessoaDivisaoId }),
    }));
    setToast("Lançamento salvo com sucesso!");
    carregar();
  }

  async function atualizarLancamento(id: string, input: Partial<Lancamento>) {
    setErro(null);
    const response = await fetch(`/api/lancamentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    carregar();
  }

  async function removerLancamento(lancamento: Lancamento): Promise<boolean> {
    if (
      !(await confirmar(
        "Remover esse lançamento? Essa ação não pode ser desfeita.",
      ))
    ) {
      return false;
    }
    setErro(null);
    const response = await fetch(`/api/lancamentos/${lancamento.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return false;
    }
    carregar();
    return true;
  }

  // ── Importação ────────────────────────────────────────────────────────

  async function processarArquivo(arquivo: File) {
    setErro(null);
    if (!importBancoId || !importTemplateId) {
      setErro(
        "Selecione o banco e o modelo de importação antes de enviar o arquivo.",
      );
      return;
    }
    setAnalisando(true);
    try {
      const csv = await arquivo.text();
      const response = await fetch("/api/importacao/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bancoId: importBancoId,
          templateId: importTemplateId,
          csv,
        }),
      });
      if (!response.ok) {
        setErro(await parseErro(response));
        return;
      }
      const body = await response.json();
      setErrosImportacao(body.erros ?? []);
      const novas: LinhaRevisao[] = (body.linhas as LinhaPreview[]).map(
        (linha) => ({
          ...linha,
          selecionada: !linha.duplicado,
          categoriaId: linha.categoriaSugeridaId ?? "",
          subcategoriaId: linha.subcategoriaSugeridaId ?? "",
          pessoaDivisaoId: importPessoaDivisaoId,
        }),
      );
      setLinhasRevisao((atual) => {
        const hashesAtuais = new Set(atual.map((l) => l.hash));
        return [...atual, ...novas.filter((l) => !hashesAtuais.has(l.hash))];
      });
      setPaginaRevisao(0);
    } finally {
      setAnalisando(false);
    }
  }

  function onSoltarArquivo(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastandoArquivo(false);
    const arquivo = e.dataTransfer.files?.[0];
    if (arquivo) processarArquivo(arquivo);
  }

  function atualizarLinhaRevisao(hash: string, patch: Partial<LinhaRevisao>) {
    setLinhasRevisao(
      (atual) =>
        atual?.map((l) => (l.hash === hash ? { ...l, ...patch } : l)) ?? [],
    );
  }

  async function confirmarLinhas(linhas: LinhaRevisao[]) {
    if (linhas.length === 0) return;
    setErro(null);
    const response = await fetch("/api/importacao/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bancoId: importBancoId,
        pessoaDivisaoId: importPessoaDivisaoId,
        pessoaPagouId: importPessoaPagouId,
        linhas: linhas.map((l) => ({
          data: l.data,
          descricaoOrigem: l.descricaoOrigem,
          valorCentavos: l.valorCentavos,
          categoriaId: l.categoriaId || null,
          subcategoriaId: l.subcategoriaId || null,
          pessoaDivisaoId: l.pessoaDivisaoId || null,
        })),
      }),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    const body = await response.json();
    const hashesConfirmadas = new Set(linhas.map((l) => l.hash));
    setLinhasRevisao((atual) =>
      atual.filter((l) => !hashesConfirmadas.has(l.hash)),
    );
    setToast(
      `${body.criados} lançamento(s) aprovado(s)${body.duplicadosIgnorados ? `, ${body.duplicadosIgnorados} duplicado(s) ignorado(s)` : ""}.`,
    );
    carregar();
  }

  function removerLinhaRevisao(hash: string) {
    setLinhasRevisao((atual) => atual.filter((l) => l.hash !== hash));
  }

  function aplicarCategoriaEmMassa() {
    setLinhasRevisao((atual) =>
      atual.map((l) =>
        l.selecionada
          ? { ...l, categoriaId: categoriaEmMassa, subcategoriaId: "" }
          : l,
      ),
    );
    setAcoesEmMassaAberto(false);
    setCategoriaEmMassa("");
  }

  const linhasNaoDuplicadas = linhasRevisao.filter((l) => !l.duplicado);
  const totalPaginasRevisao = Math.max(
    1,
    Math.ceil(linhasRevisao.length / TAMANHO_PAGINA_REVISAO),
  );
  const linhasRevisaoPagina = linhasRevisao.slice(
    paginaRevisao * TAMANHO_PAGINA_REVISAO,
    paginaRevisao * TAMANHO_PAGINA_REVISAO + TAMANHO_PAGINA_REVISAO,
  );

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para gerenciar lançamentos.
      </p>
    );
  }

  const inputClass =
    "rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-1.5 text-sm focus:border-primary focus:outline-none";

  return (
    <div className="gap-lg flex flex-col">
      {dialogConfirmacao}

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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setMostrarFiltros((v) => !v)}
          className="border-outline-variant bg-surface-container-lowest px-md text-on-surface hover:bg-surface-container-low rounded-full border py-1.5 text-xs font-semibold"
        >
          ☰ Filtros
        </button>
      </div>

      <div className="gap-lg grid grid-cols-1 lg:grid-cols-[1fr_360px]">
        {/* Lançamento Expresso */}
        <form
          onSubmit={criarLancamento}
          className="gap-sm border-outline-variant bg-surface-container-lowest p-lg flex flex-col rounded-xl border"
        >
          <h2 className="text-on-surface flex items-center gap-1.5 text-lg font-bold">
            <span aria-hidden>⚡</span> Lançamento Expresso
          </h2>

          <div className="gap-sm grid grid-cols-2 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="l-data"
              >
                Data
              </label>
              <input
                id="l-data"
                type="date"
                className={inputClass}
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="l-categoria"
              >
                Categoria
              </label>
              <select
                id="l-categoria"
                className={inputClass}
                value={form.categoriaId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    categoriaId: e.target.value,
                    subcategoriaId: SEM_CATEGORIA,
                  })
                }
              >
                <option value={SEM_CATEGORIA}>Nenhuma</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="l-subcategoria"
              >
                Subcategoria
              </label>
              <select
                id="l-subcategoria"
                className={inputClass}
                value={form.subcategoriaId}
                onChange={(e) =>
                  setForm({ ...form, subcategoriaId: e.target.value })
                }
                disabled={!form.categoriaId}
              >
                <option value={SEM_CATEGORIA}>Nenhuma</option>
                {subcategoriasDaCategoriaSelecionada.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="l-banco"
              >
                Banco / Cartão
              </label>
              <select
                id="l-banco"
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
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="l-descricao"
            >
              Descrição
            </label>
            <input
              id="l-descricao"
              className={inputClass}
              placeholder="Ex: Supermercado"
              value={form.descricaoPropria}
              onChange={(e) =>
                setForm({ ...form, descricaoPropria: e.target.value })
              }
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-on-surface-variant text-xs font-semibold">
              Quem Pagou?
            </span>
            <div className="flex flex-wrap gap-2">
              {pessoas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setForm({ ...form, pessoaPagouId: p.id })}
                  className={
                    form.pessoaPagouId === p.id
                      ? "bg-primary px-md text-on-primary rounded-lg py-1.5 text-sm font-semibold"
                      : "border-outline-variant bg-surface-container-lowest px-md text-on-surface hover:bg-surface-container-low rounded-lg border py-1.5 text-sm"
                  }
                >
                  {p.nome}
                </button>
              ))}
            </div>
          </div>

          <div className="gap-sm grid grid-cols-1 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="l-divisao"
              >
                Divisão
              </label>
              <select
                id="l-divisao"
                className={inputClass}
                value={form.pessoaDivisaoId}
                onChange={(e) =>
                  setForm({ ...form, pessoaDivisaoId: e.target.value })
                }
                required
              >
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {p.tipo === "CASAL" ? " (50/50)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="l-valor"
              >
                Valor (R$)
              </label>
              <input
                id="l-valor"
                type="number"
                step="0.01"
                title="Use valor negativo para estornos"
                className={inputClass}
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                placeholder="0,00"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="l-desconto"
              >
                Desconto / Estorno
              </label>
              <input
                id="l-desconto"
                type="number"
                step="0.01"
                min={0}
                className={inputClass}
                value={form.desconto}
                onChange={(e) => setForm({ ...form, desconto: e.target.value })}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-on-surface flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.pagoComResgateInvestimento}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pagoComResgateInvestimento: e.target.checked,
                    investimentoResgateId: e.target.checked
                      ? form.investimentoResgateId
                      : "",
                  })
                }
              />
              Pago com resgate de investimento
            </label>
            {form.pagoComResgateInvestimento && (
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="l-investimento"
                >
                  Investimento (opcional)
                </label>
                <select
                  id="l-investimento"
                  className={inputClass}
                  value={form.investimentoResgateId}
                  onChange={(e) =>
                    setForm({ ...form, investimentoResgateId: e.target.value })
                  }
                >
                  <option value="">Não informado</option>
                  {investimentos.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.produto}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="bg-primary px-lg text-on-primary mt-1 w-fit rounded-full py-2 text-sm font-semibold hover:opacity-90"
          >
            Salvar Lançamento
          </button>
        </form>

        {/* Importar Extrato */}
        <div className="gap-sm border-outline-variant bg-surface-container-lowest p-lg flex flex-col rounded-xl border border-dashed">
          <div className="gap-sm grid grid-cols-1">
            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="i-banco"
              >
                Banco / Cartão
              </label>
              <select
                id="i-banco"
                className={inputClass}
                value={importBancoId}
                onChange={(e) => setImportBancoId(e.target.value)}
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
                htmlFor="i-template"
              >
                Modelo do arquivo
              </label>
              <select
                id="i-template"
                className={inputClass}
                value={importTemplateId}
                onChange={(e) => setImportTemplateId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nomeExibicao}
                  </option>
                ))}
              </select>
            </div>
            <div className="gap-sm grid grid-cols-2">
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="i-divisão"
                >
                  Divisão padrão
                </label>
                <select
                  id="i-divisão"
                  className={inputClass}
                  value={importPessoaDivisaoId}
                  onChange={(e) => setImportPessoaDivisaoId(e.target.value)}
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
                  htmlFor="i-pagou"
                >
                  Pagou
                </label>
                <select
                  id="i-pagou"
                  className={inputClass}
                  value={importPessoaPagouId}
                  onChange={(e) => setImportPessoaPagouId(e.target.value)}
                >
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastandoArquivo(true);
            }}
            onDragLeave={() => setArrastandoArquivo(false)}
            onDrop={onSoltarArquivo}
            onClick={() => inputArquivoRef.current?.click()}
            className={`p-lg flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors ${
              arrastandoArquivo
                ? "border-primary bg-primary/5"
                : "border-outline-variant"
            }`}
          >
            <span
              className="bg-primary-container/20 flex h-10 w-10 items-center justify-center rounded-full text-lg"
              aria-hidden
            >
              ⬆
            </span>
            <p className="text-on-surface font-bold">
              {analisando ? "Analisando arquivo…" : "Importar OFX/CSV"}
            </p>
            <p className="text-on-surface-variant text-xs">
              Arraste seu extrato bancário aqui para conciliação inteligente.
            </p>
            <span className="text-primary text-xs font-semibold underline">
              Procurar arquivos
            </span>
            <input
              ref={inputArquivoRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) processarArquivo(arquivo);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      {errosImportacao.length > 0 && (
        <div className="border-tertiary-container/30 bg-tertiary-container/10 p-sm text-tertiary-container rounded-xl border text-sm">
          <p className="font-medium">
            {errosImportacao.length} linha(s) não puderam ser lidas:
          </p>
          <ul className="list-inside list-disc">
            {errosImportacao.map((e) => (
              <li key={e.numeroLinha}>
                Linha {e.numeroLinha}: {e.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {linhasRevisao.length > 0 && (
        <div className="gap-sm border-outline-variant bg-surface-container-lowest p-lg flex flex-col rounded-xl border">
          <div className="gap-sm flex flex-wrap items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-on-surface text-lg font-bold">
                Revisão de Importações
              </h2>
              <span className="bg-secondary-container px-sm text-on-secondary-container rounded-full py-0.5 text-xs font-bold">
                {linhasNaoDuplicadas.length} Pendentes
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAcoesEmMassaAberto((v) => !v)}
                className="border-outline-variant bg-surface-container-lowest px-md text-on-surface hover:bg-surface-container-low rounded-full border py-1.5 text-xs font-semibold"
              >
                Ações em Massa
              </button>
              <button
                type="button"
                onClick={() =>
                  confirmarLinhas(
                    linhasNaoDuplicadas.filter((l) => l.selecionada),
                  )
                }
                className="bg-primary px-md text-on-primary rounded-full py-1.5 text-xs font-semibold hover:opacity-90"
              >
                Aprovar Tudo
              </button>
            </div>
          </div>

          {acoesEmMassaAberto && (
            <div className="bg-surface-container-low p-sm flex flex-wrap items-end gap-2 rounded-lg">
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="massa-categoria"
                >
                  Aplicar categoria às linhas selecionadas
                </label>
                <select
                  id="massa-categoria"
                  className={inputClass}
                  value={categoriaEmMassa}
                  onChange={(e) => setCategoriaEmMassa(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!categoriaEmMassa}
                onClick={aplicarCategoriaEmMassa}
                className="bg-primary px-md text-on-primary rounded-full py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              >
                Aplicar
              </button>
              <button
                type="button"
                onClick={() => setAcoesEmMassaAberto(false)}
                className="text-on-surface-variant text-xs"
              >
                Cancelar
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-outline-variant text-on-surface-variant border-b text-left text-xs font-semibold tracking-wide uppercase">
                  <th className="p-2"></th>
                  <th className="p-2">Data</th>
                  <th className="p-2">Descrição</th>
                  <th className="p-2">Sugestão / Categoria</th>
                  <th className="p-2">Divisão</th>
                  <th className="p-2">Tipo</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {linhasRevisaoPagina.map((linha) => {
                  const categoriaAtual = categorias.find(
                    (c) => c.id === linha.categoriaId,
                  );
                  const divisaoPessoa = pessoasPorId.get(linha.pessoaDivisaoId);
                  const ehAjuste = linha.valorCentavos < 0;
                  const tipo = ehAjuste
                    ? {
                        label: "Ajuste",
                        classe: "bg-surface-container text-on-surface-variant",
                      }
                    : divisaoPessoa?.tipo === "INDIVIDUAL"
                      ? {
                          label: "Individual",
                          classe: "bg-secondary/10 text-secondary",
                        }
                      : {
                          label: "Dividido",
                          classe: "bg-primary/10 text-primary",
                        };
                  return (
                    <tr
                      key={linha.hash}
                      className={`border-outline-variant/60 border-b ${linha.duplicado ? "opacity-50" : ""}`}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={linha.selecionada}
                          disabled={linha.duplicado}
                          onChange={(e) =>
                            atualizarLinhaRevisao(linha.hash, {
                              selecionada: e.target.checked,
                            })
                          }
                        />
                      </td>
                      <td className="p-2 whitespace-nowrap">{linha.data}</td>
                      <td className="p-2">
                        <p className="text-on-surface font-semibold">
                          {linha.descricaoOrigem}
                        </p>
                        {linha.duplicado && (
                          <span className="bg-surface-container text-on-surface-variant rounded-full px-1.5 py-0.5 text-xs">
                            já importado
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <select
                          className={inputClass}
                          value={linha.categoriaId}
                          onChange={(e) =>
                            atualizarLinhaRevisao(linha.hash, {
                              categoriaId: e.target.value,
                              subcategoriaId: "",
                            })
                          }
                        >
                          <option value="">—</option>
                          {categorias.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                        {categoriaAtual && (
                          <select
                            className={`mt-1 ${inputClass}`}
                            value={linha.subcategoriaId}
                            onChange={(e) =>
                              atualizarLinhaRevisao(linha.hash, {
                                subcategoriaId: e.target.value,
                              })
                            }
                          >
                            <option value="">—</option>
                            {categoriaAtual.subcategorias.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nome}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="p-2">
                        <select
                          className={inputClass}
                          value={linha.pessoaDivisaoId}
                          onChange={(e) =>
                            atualizarLinhaRevisao(linha.hash, {
                              pessoaDivisaoId: e.target.value,
                            })
                          }
                        >
                          {pessoas.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <span
                          className={`px-sm rounded-full py-0.5 text-xs font-semibold ${tipo.classe}`}
                        >
                          {tipo.label}
                        </span>
                      </td>
                      <td
                        className={`data-tabular p-2 text-right ${ehAjuste ? "text-success" : "text-on-surface"}`}
                      >
                        {ehAjuste ? "+ " : ""}
                        {formatarMoeda(linha.valorCentavos)}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          {!linha.duplicado && (
                            <button
                              type="button"
                              title="Aprovar esta linha"
                              onClick={() => confirmarLinhas([linha])}
                              className="text-success text-sm font-semibold"
                            >
                              ✓
                            </button>
                          )}
                          <button
                            type="button"
                            title="Remover da lista"
                            onClick={() => removerLinhaRevisao(linha.hash)}
                            className="text-danger text-sm font-semibold"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-on-surface-variant flex items-center justify-between text-xs">
            <span>
              Mostrando {linhasRevisaoPagina.length} de {linhasRevisao.length}{" "}
              pendentes
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={paginaRevisao === 0}
                onClick={() => setPaginaRevisao((p) => Math.max(0, p - 1))}
                className="border-outline-variant px-sm rounded-full border py-1 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={paginaRevisao >= totalPaginasRevisao - 1}
                onClick={() =>
                  setPaginaRevisao((p) =>
                    Math.min(totalPaginasRevisao - 1, p + 1),
                  )
                }
                className="border-outline-variant px-sm rounded-full border py-1 disabled:opacity-40"
              >
                Próximo
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarFiltros && (
        <div className="gap-sm border-outline-variant bg-surface-container-lowest p-lg flex flex-wrap items-end rounded-xl border">
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="f-inicio"
            >
              De
            </label>
            <input
              id="f-inicio"
              type="date"
              className={inputClass}
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="f-fim"
            >
              Até
            </label>
            <input
              id="f-fim"
              type="date"
              className={inputClass}
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="f-categoria"
            >
              Categoria
            </label>
            <select
              id="f-categoria"
              className={inputClass}
              value={filtroCategoriaId}
              onChange={(e) => setFiltroCategoriaId(e.target.value)}
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-on-surface-variant text-xs font-semibold"
              htmlFor="f-banco"
            >
              Banco
            </label>
            <select
              id="f-banco"
              className={inputClass}
              value={filtroBancoId}
              onChange={(e) => setFiltroBancoId(e.target.value)}
            >
              <option value="">Todos</option>
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
              htmlFor="f-pessoa"
            >
              Pessoa
            </label>
            <select
              id="f-pessoa"
              className={inputClass}
              value={filtroPessoaId}
              onChange={(e) => setFiltroPessoaId(e.target.value)}
            >
              <option value="">Todas</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="border-outline-variant bg-surface-container-lowest overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-outline-variant text-on-surface-variant border-b text-xs font-semibold tracking-wide uppercase">
              <ColumnHeader
                label="Data"
                chave="data"
                tipo="data"
                ordenacao={ordenacao}
                onOrdenar={aoOrdenarColuna}
                filtro={filtros.data}
                onFiltrar={aoFiltrarColuna}
                onLimparFiltro={aoLimparFiltroColuna}
              />
              <ColumnHeader
                label="Descrição"
                chave="descricao"
                tipo="texto"
                ordenacao={ordenacao}
                onOrdenar={aoOrdenarColuna}
                filtro={filtros.descricao}
                onFiltrar={aoFiltrarColuna}
                onLimparFiltro={aoLimparFiltroColuna}
              />
              <ColumnHeader
                label="Valor"
                chave="valor"
                tipo="numero"
                align="right"
                ordenacao={ordenacao}
                onOrdenar={aoOrdenarColuna}
                filtro={filtros.valor}
                onFiltrar={aoFiltrarColuna}
                onLimparFiltro={aoLimparFiltroColuna}
              />
              <ColumnHeader
                label="Categoria"
                chave="categoria"
                tipo="opcoes"
                opcoes={opcoesColunas.categoria}
                ordenacao={ordenacao}
                onOrdenar={aoOrdenarColuna}
                filtro={filtros.categoria}
                onFiltrar={aoFiltrarColuna}
                onLimparFiltro={aoLimparFiltroColuna}
              />
              <ColumnHeader
                label="Subcategoria"
                chave="subcategoria"
                tipo="opcoes"
                opcoes={opcoesColunas.subcategoria}
                ordenacao={ordenacao}
                onOrdenar={aoOrdenarColuna}
                filtro={filtros.subcategoria}
                onFiltrar={aoFiltrarColuna}
                onLimparFiltro={aoLimparFiltroColuna}
              />
              <ColumnHeader
                label="Banco"
                chave="banco"
                tipo="opcoes"
                opcoes={opcoesColunas.banco}
                ordenacao={ordenacao}
                onOrdenar={aoOrdenarColuna}
                filtro={filtros.banco}
                onFiltrar={aoFiltrarColuna}
                onLimparFiltro={aoLimparFiltroColuna}
              />
              <ColumnHeader
                label="Divisão"
                chave="divisao"
                tipo="opcoes"
                opcoes={opcoesColunas.divisao}
                ordenacao={ordenacao}
                onOrdenar={aoOrdenarColuna}
                filtro={filtros.divisao}
                onFiltrar={aoFiltrarColuna}
                onLimparFiltro={aoLimparFiltroColuna}
              />
              <ColumnHeader
                label="Pagou"
                chave="pagou"
                tipo="opcoes"
                opcoes={opcoesColunas.pagou}
                ordenacao={ordenacao}
                onOrdenar={aoOrdenarColuna}
                filtro={filtros.pagou}
                onFiltrar={aoFiltrarColuna}
                onLimparFiltro={aoLimparFiltroColuna}
              />
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {lancamentosProcessados
              .slice(
                paginaLancamentos * TAMANHO_PAGINA_LANCAMENTOS,
                paginaLancamentos * TAMANHO_PAGINA_LANCAMENTOS +
                  TAMANHO_PAGINA_LANCAMENTOS,
              )
              .map((lancamento) => (
                <LinhaLancamento
                  key={lancamento.id}
                  lancamento={lancamento}
                  categorias={categorias}
                  bancos={bancos}
                  pessoas={pessoas}
                  investimentos={investimentos}
                  nome={nome}
                  onAtualizar={atualizarLancamento}
                  onRemover={removerLancamento}
                  emEdicao={editandoId === lancamento.id}
                  onIniciarEdicao={() => setEditandoId(lancamento.id)}
                  onCancelarEdicao={() => setEditandoId(null)}
                  onAbrirDetalhe={() => setDetalheId(lancamento.id)}
                />
              ))}
          </tbody>
        </table>
      </div>

      {lancamentos && lancamentosProcessados.length === 0 && (
        <p className="text-on-surface-variant text-sm">
          {lancamentos.length === 0
            ? "Nenhum lançamento encontrado."
            : "Nenhum lançamento corresponde aos filtros das colunas."}
        </p>
      )}

      {lancamentosProcessados.length > TAMANHO_PAGINA_LANCAMENTOS && (
        <div className="text-on-surface-variant flex items-center justify-between text-xs">
          <span>
            Mostrando{" "}
            {Math.min(
              TAMANHO_PAGINA_LANCAMENTOS,
              lancamentosProcessados.length -
                paginaLancamentos * TAMANHO_PAGINA_LANCAMENTOS,
            )}{" "}
            de {lancamentosProcessados.length} lançamentos
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={paginaLancamentos === 0}
              onClick={() => setPaginaLancamentos((p) => Math.max(0, p - 1))}
              className="border-outline-variant px-sm rounded-full border py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={
                (paginaLancamentos + 1) * TAMANHO_PAGINA_LANCAMENTOS >=
                lancamentosProcessados.length
              }
              onClick={() => setPaginaLancamentos((p) => p + 1)}
              className="border-outline-variant px-sm rounded-full border py-1 disabled:opacity-40"
            >
              Próximo
            </button>
          </div>
        </div>
      )}

      {lancamentoDetalhe && (
        <DetalheLancamentoDrawer
          lancamento={lancamentoDetalhe}
          pessoas={pessoas}
          investimentos={investimentos}
          nome={nome}
          onFechar={() => setDetalheId(null)}
          onEditar={() => {
            setEditandoId(lancamentoDetalhe.id);
            setDetalheId(null);
          }}
          onRemover={async () => {
            if (await removerLancamento(lancamentoDetalhe)) {
              setDetalheId(null);
            }
          }}
        />
      )}
    </div>
  );
}

function LinhaLancamento({
  lancamento,
  categorias,
  bancos,
  pessoas,
  investimentos,
  nome,
  onAtualizar,
  onRemover,
  emEdicao,
  onIniciarEdicao,
  onCancelarEdicao,
  onAbrirDetalhe,
}: {
  lancamento: Lancamento;
  categorias: Categoria[];
  bancos: Banco[];
  pessoas: Pessoa[];
  investimentos: Investimento[];
  nome: {
    banco: (id: string) => string;
    pessoa: (id: string) => string;
    categoria: (id: string | null) => string;
    subcategoria: (id: string | null) => string;
  };
  onAtualizar: (id: string, input: Partial<Lancamento>) => Promise<void>;
  onRemover: (lancamento: Lancamento) => Promise<boolean>;
  emEdicao: boolean;
  onIniciarEdicao: () => void;
  onCancelarEdicao: () => void;
  onAbrirDetalhe: () => void;
}) {
  const [data, setData] = useState(dataParaInputDate(lancamento.data));
  const [descricao, setDescricao] = useState(lancamento.descricaoPropria ?? "");
  const [valor, setValor] = useState(
    centavosParaReais(lancamento.valorCentavos),
  );
  const [categoriaId, setCategoriaId] = useState(
    lancamento.categoriaId ?? SEM_CATEGORIA,
  );
  const [subcategoriaId, setSubcategoriaId] = useState(
    lancamento.subcategoriaId ?? SEM_CATEGORIA,
  );
  const [bancoId, setBancoId] = useState(lancamento.bancoId);
  const [pessoaDivisaoId, setPessoaDivisaoId] = useState(
    lancamento.pessoaDivisaoId,
  );
  const [pessoaPagouId, setPessoaPagouId] = useState(lancamento.pessoaPagouId);
  const [pagoComResgateInvestimento, setPagoComResgateInvestimento] = useState(
    lancamento.pagoComResgateInvestimento ?? false,
  );
  const [investimentoResgateId, setInvestimentoResgateId] = useState(
    lancamento.investimentoResgateId ?? "",
  );

  const valorLiquido = lancamento.valorCentavos - lancamento.descontoCentavos;
  const subcategoriasDaCategoria =
    categorias.find((c) => c.id === categoriaId)?.subcategorias ?? [];

  async function salvar() {
    await onAtualizar(lancamento.id, {
      data,
      descricaoPropria: descricao || null,
      valorCentavos: reaisParaCentavos(valor),
      categoriaId: categoriaId || null,
      subcategoriaId: subcategoriaId || null,
      bancoId,
      pessoaDivisaoId,
      pessoaPagouId,
      pagoComResgateInvestimento,
      investimentoResgateId: pagoComResgateInvestimento
        ? investimentoResgateId || null
        : null,
    });
    onCancelarEdicao();
  }

  const inputClass =
    "rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1";

  if (emEdicao) {
    return (
      <tr className="border-outline-variant/60 bg-surface-container-low border-b">
        <td colSpan={9} className="p-sm">
          <div className="gap-sm flex flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label className="text-on-surface-variant text-xs font-semibold">
                Data
              </label>
              <input
                type="date"
                className={inputClass}
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-on-surface-variant text-xs font-semibold">
                Descrição
              </label>
              <input
                className={inputClass}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder={lancamento.descricaoOrigem ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-on-surface-variant text-xs font-semibold">
                Valor
              </label>
              <input
                type="number"
                step="0.01"
                className={`w-24 text-right ${inputClass}`}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-on-surface-variant text-xs font-semibold">
                Categoria
              </label>
              <select
                className={inputClass}
                value={categoriaId}
                onChange={(e) => {
                  setCategoriaId(e.target.value);
                  setSubcategoriaId(SEM_CATEGORIA);
                }}
              >
                <option value={SEM_CATEGORIA}>Nenhuma</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-on-surface-variant text-xs font-semibold">
                Subcategoria
              </label>
              <select
                className={inputClass}
                value={subcategoriaId}
                onChange={(e) => setSubcategoriaId(e.target.value)}
                disabled={!categoriaId}
              >
                <option value={SEM_CATEGORIA}>Nenhuma</option>
                {subcategoriasDaCategoria.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-on-surface-variant text-xs font-semibold">
                Banco
              </label>
              <select
                className={inputClass}
                value={bancoId}
                onChange={(e) => setBancoId(e.target.value)}
              >
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-on-surface-variant text-xs font-semibold">
                Divisão
              </label>
              <select
                className={inputClass}
                value={pessoaDivisaoId}
                onChange={(e) => setPessoaDivisaoId(e.target.value)}
              >
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-on-surface-variant text-xs font-semibold">
                Pagou
              </label>
              <select
                className={inputClass}
                value={pessoaPagouId}
                onChange={(e) => setPessoaPagouId(e.target.value)}
              >
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-on-surface-variant flex items-center gap-1.5 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={pagoComResgateInvestimento}
                  onChange={(e) => {
                    setPagoComResgateInvestimento(e.target.checked);
                    if (!e.target.checked) setInvestimentoResgateId("");
                  }}
                />
                Resgate de investimento
              </label>
              {pagoComResgateInvestimento && (
                <select
                  className={inputClass}
                  value={investimentoResgateId}
                  onChange={(e) => setInvestimentoResgateId(e.target.value)}
                >
                  <option value="">Não informado</option>
                  {investimentos.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.produto}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex gap-2">
              <button
                className="text-success hover:bg-surface-container rounded-full p-1.5 transition-colors"
                onClick={salvar}
                title="Salvar"
                aria-label="Salvar"
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
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </button>
              <button
                className="text-on-surface-variant hover:bg-surface-container rounded-full p-1.5 transition-colors"
                onClick={onCancelarEdicao}
                title="Cancelar"
                aria-label="Cancelar"
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
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  const divisaoPessoa = pessoas.find(
    (p) => p.id === lancamento.pessoaDivisaoId,
  );

  return (
    <tr
      className="border-outline-variant/60 hover:bg-surface-container-low cursor-pointer border-b"
      onClick={onAbrirDetalhe}
    >
      <td className="p-2 whitespace-nowrap">
        {dataParaInputDate(lancamento.data)}
      </td>
      <td
        className="max-w-xs truncate p-2"
        title={
          lancamento.descricaoPropria || lancamento.descricaoOrigem || undefined
        }
      >
        {lancamento.descricaoPropria || lancamento.descricaoOrigem || "—"}
      </td>
      <td className="data-tabular p-2 text-right whitespace-nowrap">
        R$ {centavosParaReais(valorLiquido)}
      </td>
      <td className="p-2 whitespace-nowrap">
        {nome.categoria(lancamento.categoriaId)}
      </td>
      <td className="p-2 whitespace-nowrap">
        {lancamento.subcategoriaId
          ? nome.subcategoria(lancamento.subcategoriaId)
          : "—"}
      </td>
      <td className="p-2 whitespace-nowrap">
        {nome.banco(lancamento.bancoId)}
      </td>
      <td className="p-2 whitespace-nowrap">
        {divisaoPessoa ? (
          <PessoaBadge
            nome={divisaoPessoa.nome}
            pessoaId={divisaoPessoa.id}
            compartilhado={divisaoPessoa.tipo !== "INDIVIDUAL"}
          />
        ) : (
          nome.pessoa(lancamento.pessoaDivisaoId)
        )}
      </td>
      <td className="p-2 whitespace-nowrap">
        {nome.pessoa(lancamento.pessoaPagouId)}
      </td>
      <td className="flex gap-2 p-2" onClick={(e) => e.stopPropagation()}>
        <button
          className="text-primary hover:bg-surface-container rounded-full p-1.5 transition-colors"
          onClick={onIniciarEdicao}
          title="Editar"
          aria-label="Editar"
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
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button
          className="text-danger hover:bg-surface-container rounded-full p-1.5 transition-colors"
          onClick={() => onRemover(lancamento)}
          title="Remover"
          aria-label="Remover"
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
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

function DetalheLancamentoDrawer({
  lancamento,
  pessoas,
  investimentos,
  nome,
  onFechar,
  onEditar,
  onRemover,
}: {
  lancamento: Lancamento;
  pessoas: Pessoa[];
  investimentos: Investimento[];
  nome: {
    banco: (id: string) => string;
    pessoa: (id: string) => string;
    categoria: (id: string | null) => string;
    subcategoria: (id: string | null) => string;
  };
  onFechar: () => void;
  onEditar: () => void;
  onRemover: () => void;
}) {
  const valorLiquido = lancamento.valorCentavos - lancamento.descontoCentavos;
  const divisaoPessoa = pessoas.find(
    (p) => p.id === lancamento.pessoaDivisaoId,
  );
  const categoriaLabel = lancamento.subcategoriaId
    ? `${nome.categoria(lancamento.categoriaId)} (${nome.subcategoria(lancamento.subcategoriaId)})`
    : nome.categoria(lancamento.categoriaId);
  const investimentoResgate = investimentos.find(
    (i) => i.id === lancamento.investimentoResgateId,
  );
  const resgateLabel = lancamento.pagoComResgateInvestimento
    ? investimentoResgate
      ? `Sim — ${investimentoResgate.produto}`
      : "Sim"
    : "Não";

  return (
    <div
      className="bg-on-surface/40 fixed inset-0 z-[100] flex justify-end"
      onClick={onFechar}
    >
      <div
        className="gap-md border-outline-variant bg-surface-container-lowest p-lg flex h-full w-full max-w-[28rem] flex-col overflow-y-auto border-l shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-on-surface text-lg font-bold">
            Detalhes do lançamento
          </h2>
          <button
            type="button"
            onClick={onFechar}
            title="Fechar"
            aria-label="Fechar"
            className="text-on-surface-variant hover:bg-surface-container rounded-full p-1.5"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <CampoDetalhe label="Data" valor={dataParaInputDate(lancamento.data)} />
        <CampoDetalhe
          label="Descrição"
          valor={
            lancamento.descricaoPropria || lancamento.descricaoOrigem || "—"
          }
        />
        <CampoDetalhe
          label="Valor"
          valor={`R$ ${centavosParaReais(valorLiquido)}`}
        />
        <CampoDetalhe label="Categoria" valor={categoriaLabel} />
        <CampoDetalhe label="Banco" valor={nome.banco(lancamento.bancoId)} />
        <div className="flex flex-col gap-1">
          <span className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">
            Divisão
          </span>
          {divisaoPessoa ? (
            <PessoaBadge
              nome={divisaoPessoa.nome}
              pessoaId={divisaoPessoa.id}
              compartilhado={divisaoPessoa.tipo !== "INDIVIDUAL"}
            />
          ) : (
            <span className="text-on-surface text-sm">
              {nome.pessoa(lancamento.pessoaDivisaoId)}
            </span>
          )}
        </div>
        <CampoDetalhe
          label="Pagou"
          valor={nome.pessoa(lancamento.pessoaPagouId)}
        />
        <CampoDetalhe
          label="Pago com resgate de investimento"
          valor={resgateLabel}
        />

        <div className="border-outline-variant pt-md mt-auto flex gap-2 border-t">
          <button
            type="button"
            onClick={onEditar}
            className="border-outline-variant px-md text-on-surface hover:bg-surface-container-low flex-1 rounded-full border py-2 text-sm font-semibold"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={onRemover}
            className="bg-danger px-md text-on-danger flex-1 rounded-full py-2 text-sm font-semibold hover:opacity-90"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}

function CampoDetalhe({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">
        {label}
      </span>
      <span className="text-on-surface text-sm break-words">{valor}</span>
    </div>
  );
}
