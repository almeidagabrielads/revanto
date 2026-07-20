"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useConfirmDialog } from "../components/ConfirmDialog";
import type { SugestaoDescricao } from "../components/DescricaoAutocomplete";
import { useTabela, type ColunaTabela } from "../components/useTabela";
import type { FiltroColuna } from "@/lib/domain/tabela";
import { buscarTemplate, gerarExemploCsv } from "@/lib/domain/import/templates";
import {
  intervaloDoMes,
  montarRequisicaoCriarLancamento,
  resumoImportacaoTexto as montarResumoImportacaoTexto,
  validarFormLancamento,
  type FormLancamento as FormLancamentoDomain,
} from "@/lib/domain/lancamentos";
import { reaisParaCentavos } from "@/lib/domain/formatacao";
import { LancamentosHeader } from "./components/LancamentosHeader";
import { NovoLancamentoModal } from "./components/NovoLancamentoModal";
import { ImportarLancamentosModal } from "./components/ImportarLancamentosModal";
import { LancamentosTable } from "./components/LancamentosTable";
import {
  SEM_CATEGORIA,
  dataParaInputDate,
  labelTipoGasto,
  type Banco,
  type Categoria,
  type ErroImportacao,
  type Investimento,
  type Lancamento,
  type LinhaPreview,
  type LinhaRevisao,
  type Pessoa,
  type Template,
} from "./components/types";

async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível completar a operação.";
}

const TAMANHO_PAGINA_REVISAO = 8;
const TAMANHO_PAGINA_LANCAMENTOS = 25;

function formVazio(defaults: {
  bancoId?: string;
  pessoaId?: string;
  modoParcelamentoPadrao?: string;
}): FormLancamentoDomain {
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
    tipoGasto: "VARIAVEL",
    parcelar: false,
    quantidadeParcelas: "2",
    modoParcelamento: defaults.modoParcelamentoPadrao ?? "GRADUAL",
  };
}

export function LancamentosClient() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [investimentos, setInvestimentos] = useState<Investimento[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[] | null>(null);
  const [parcelamentosPorId, setParcelamentosPorId] = useState<
    Map<string, number>
  >(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [naoAutenticado, setNaoAutenticado] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [reloadPainelParcelamentos, setReloadPainelParcelamentos] = useState(0);
  const [modoParcelamentoPadrao, setModoParcelamentoPadrao] =
    useState("GRADUAL");
  const [toast, setToast] = useState<string | null>(null);
  const { confirmar, dialog: dialogConfirmacao } = useConfirmDialog();

  const [anoFiltroMeses, setAnoFiltroMeses] = useState(() =>
    new Date().getFullYear(),
  );
  // null = nenhum mês selecionado — filtra pelo ano inteiro.
  const [mesFiltroSelecionado, setMesFiltroSelecionado] = useState<
    number | null
  >(null);
  const { inicio: filtroDataInicio, fim: filtroDataFim } = useMemo(() => {
    if (mesFiltroSelecionado === null) {
      return {
        inicio: `${anoFiltroMeses}-01-01`,
        fim: `${anoFiltroMeses}-12-31`,
      };
    }
    return intervaloDoMes(anoFiltroMeses, mesFiltroSelecionado);
  }, [anoFiltroMeses, mesFiltroSelecionado]);
  const anosDisponiveis = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    const inicio = Math.min(anoAtual - 6, anoFiltroMeses);
    const fim = Math.max(anoAtual + 1, anoFiltroMeses);
    const anos: number[] = [];
    for (let ano = fim; ano >= inicio; ano--) anos.push(ano);
    return anos;
  }, [anoFiltroMeses]);

  const [form, setForm] = useState<FormLancamentoDomain>(formVazio({}));

  // Importação / revisão em massa
  const [importBancoId, setImportBancoId] = useState("");
  const [importTemplateId, setImportTemplateId] = useState("");
  const [importPessoaDivisaoId, setImportPessoaDivisaoId] = useState("");
  const [importPessoaPagouId, setImportPessoaPagouId] = useState("");
  // Ignora linhas do arquivo anteriores a esta data (AAAA-MM-DD) — útil ao
  // reimportar um extrato que cobre um período maior do que o necessário.
  const [importDataInicial, setImportDataInicial] = useState("");
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(
    null,
  );
  const [analisando, setAnalisando] = useState(false);
  const [linhasRevisao, setLinhasRevisao] = useState<LinhaRevisao[]>([]);
  const [resumoImportacao, setResumoImportacao] = useState<{
    novas: number;
    duplicadas: number;
    ignoradasAntesDoPeriodo: number;
    erros: ErroImportacao[];
  } | null>(null);
  const [errosDetalheAberto, setErrosDetalheAberto] = useState(false);
  const [errosVisiveis, setErrosVisiveis] = useState(5);
  const [paginaRevisao, setPaginaRevisao] = useState(0);
  const [acoesEmMassaAberto, setAcoesEmMassaAberto] = useState(false);
  const [categoriaEmMassa, setCategoriaEmMassa] = useState("");
  const [paginaLancamentos, setPaginaLancamentos] = useState(0);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [modalImportarAberto, setModalImportarAberto] = useState(false);
  // A importação é um fluxo de duas etapas dentro de uma tela cheia (a
  // revisão tem colunas/paginação/ações em massa demais para um modal
  // pequeno): "configurar" cuida de banco/modelo/upload, "revisar" mostra a
  // tabela de revisão usando a largura toda.
  const [etapaImportacao, setEtapaImportacao] = useState<
    "configurar" | "revisar"
  >("configurar");
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  function carregar() {
    setReloadToken((t) => t + 1);
    setReloadPainelParcelamentos((t) => t + 1);
  }

  function abrirModalNovo() {
    setErro(null);
    setModalNovoAberto(true);
  }

  function fecharModalNovo() {
    setErro(null);
    setModalNovoAberto(false);
  }

  function abrirModalImportar() {
    setErro(null);
    // Se já existem linhas pendentes de uma sessão anterior, vai direto
    // para a revisão em vez de reiniciar a configuração.
    setEtapaImportacao(linhasRevisao.length > 0 ? "revisar" : "configurar");
    setModalImportarAberto(true);
  }

  function fecharModalImportar() {
    setErro(null);
    setArquivoSelecionado(null);
    setResumoImportacao(null);
    setErrosDetalheAberto(false);
    setErrosVisiveis(5);
    setModalImportarAberto(false);
  }

  async function abandonarImportacao() {
    if (linhasRevisao.length > 0) {
      const confirmado = await confirmar(
        `Cancelar a importação? ${linhasRevisao.length} linha(s) pendente(s) de revisão serão descartadas e não poderão ser recuperadas.`,
        { confirmLabel: "Descartar" },
      );
      if (!confirmado) return;
    }
    setLinhasRevisao([]);
    setPaginaRevisao(0);
    fecharModalImportar();
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
      fetch("/api/preferencias").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([cats, bcs, pes, tpls, invs, prefs]) => {
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
        const modoPadrao: string = prefs?.modoParcelamentoPadrao ?? "GRADUAL";
        setModoParcelamentoPadrao(modoPadrao);
        setForm((atual) =>
          atual.bancoId || atual.pessoaDivisaoId
            ? atual
            : formVazio({
                bancoId: bcs[0]?.id,
                pessoaId: pes[0]?.id,
                modoParcelamentoPadrao: modoPadrao,
              }),
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
    fetch("/api/parcelamentos?incluirQuitados=true")
      .then((r) => (r.ok ? r.json() : null))
      .then((lista: { id: string; quantidadeParcelas: number }[] | null) => {
        if (cancelado || !lista) return;
        setParcelamentosPorId(
          new Map(lista.map((p) => [p.id, p.quantidadeParcelas])),
        );
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [reloadToken, reloadPainelParcelamentos]);

  useEffect(() => {
    let cancelado = false;
    const params = new URLSearchParams();
    if (filtroDataInicio) params.set("dataInicio", filtroDataInicio);
    if (filtroDataFim) params.set("dataFim", filtroDataFim);

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
  }, [filtroDataInicio, filtroDataFim, reloadToken]);

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
      {
        chave: "tipoGasto",
        tipo: "opcoes",
        acessor: (l) => labelTipoGasto(l.tipoGasto),
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
      tipoGasto: unicos(base.map((l) => labelTipoGasto(l.tipoGasto))),
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
    const erroValidacao = validarFormLancamento(form, reaisParaCentavos);
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
    setErro(null);
    const { url, body } = montarRequisicaoCriarLancamento(
      form,
      reaisParaCentavos,
    );
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    setForm((atual) => ({
      ...formVazio({
        bancoId: atual.bancoId,
        pessoaId: atual.pessoaDivisaoId,
        modoParcelamentoPadrao: atual.modoParcelamento,
      }),
    }));
    setToast(
      form.parcelar
        ? "Parcelamento criado com sucesso!"
        : "Lançamento salvo com sucesso!",
    );
    setModalNovoAberto(false);
    carregar();
  }

  function aoSelecionarSugestaoDescricao(sugestao: SugestaoDescricao) {
    setForm((atual) => ({
      ...atual,
      descricaoPropria: sugestao.descricao,
      categoriaId: sugestao.categoriaId ?? SEM_CATEGORIA,
      subcategoriaId: sugestao.subcategoriaId ?? SEM_CATEGORIA,
      pessoaDivisaoId: sugestao.pessoaDivisaoId,
      tipoGasto: sugestao.tipoGasto,
    }));
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

  // Banco, divisão e pagador padrão são opcionais aqui: dependendo do
  // modelo do arquivo, essas informações já podem vir por linha (banco) ou
  // ser definidas na revisão — só o modelo é indispensável para ler o
  // arquivo.
  function validarConfiguracaoImportacao(): string | null {
    if (!importTemplateId) return "Selecione o modelo do arquivo.";
    return null;
  }

  function baixarExemploModelo() {
    const template = buscarTemplate(importTemplateId);
    if (!template) return;
    const bancoNome =
      bancos.find((b) => b.id === importBancoId)?.nome ?? bancos[0]?.nome;
    const categoriaExemplo = categorias[0];
    const divisaoNome =
      pessoas.find((p) => p.id === importPessoaDivisaoId)?.nome ??
      pessoas[0]?.nome;
    const pagouNome =
      pessoas.find((p) => p.id === importPessoaPagouId)?.nome ??
      pessoas[0]?.nome;
    const csv = gerarExemploCsv(template, {
      bancoNome,
      categoriaNome: categoriaExemplo?.nome,
      subcategoriaNome: categoriaExemplo?.subcategorias[0]?.nome,
      divisaoNome,
      pagouNome,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `exemplo-${template.id}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function selecionarArquivo(arquivo: File) {
    setErro(null);
    setResumoImportacao(null);
    setErrosDetalheAberto(false);
    setErrosVisiveis(5);
    if (!arquivo.name.toLowerCase().endsWith(".csv")) {
      setErro("Formato não suportado — envie um arquivo .csv.");
      return;
    }
    setArquivoSelecionado(arquivo);
  }

  async function validarEImportarArquivo() {
    if (!arquivoSelecionado) {
      setErro("Selecione um arquivo antes de validar.");
      return;
    }
    const erroConfig = validarConfiguracaoImportacao();
    if (erroConfig) {
      setErro(erroConfig);
      return;
    }
    setErro(null);
    setResumoImportacao(null);
    setErrosDetalheAberto(false);
    setErrosVisiveis(5);
    setAnalisando(true);
    try {
      const csv = await arquivoSelecionado.text();
      const response = await fetch("/api/importacao/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bancoId: importBancoId || null,
          templateId: importTemplateId,
          csv,
          dataInicial: importDataInicial || null,
        }),
      });
      if (!response.ok) {
        setErro(await parseErro(response));
        return;
      }
      const body = await response.json();
      const erros: ErroImportacao[] = body.erros ?? [];
      const ignoradasAntesDoPeriodo: number = body.ignoradasAntesDoPeriodo ?? 0;
      const linhasPreview = body.linhas as LinhaPreview[];
      const novas: LinhaRevisao[] = linhasPreview.map((linha) => ({
        ...linha,
        selecionada: !linha.duplicado,
        categoriaId: linha.categoriaSugeridaId ?? "",
        subcategoriaId: linha.subcategoriaSugeridaId ?? "",
        bancoId: linha.bancoSugeridoId ?? importBancoId,
        pessoaDivisaoId: linha.pessoaDivisaoSugeridaId ?? importPessoaDivisaoId,
        pessoaPagouId: linha.pessoaPagouSugeridaId ?? importPessoaPagouId,
        usarComoParcelamento: linha.parcelaDetectada !== null,
        modoParcelamento: modoParcelamentoPadrao,
      }));
      setLinhasRevisao((atual) => {
        const hashesAtuais = new Set(atual.map((l) => l.hash));
        return [...atual, ...novas.filter((l) => !hashesAtuais.has(l.hash))];
      });
      setPaginaRevisao(0);
      setResumoImportacao({
        novas: linhasPreview.filter((l) => !l.duplicado).length,
        duplicadas: linhasPreview.filter((l) => l.duplicado).length,
        ignoradasAntesDoPeriodo,
        erros,
      });
      setArquivoSelecionado(null);
    } finally {
      setAnalisando(false);
    }
  }

  function onSoltarArquivo(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastandoArquivo(false);
    const arquivo = e.dataTransfer.files?.[0];
    if (arquivo) selecionarArquivo(arquivo);
  }

  function atualizarLinhaRevisao(hash: string, patch: Partial<LinhaRevisao>) {
    setLinhasRevisao(
      (atual) =>
        atual?.map((l) => (l.hash === hash ? { ...l, ...patch } : l)) ?? [],
    );
  }

  async function confirmarLinhas(linhas: LinhaRevisao[]) {
    if (linhas.length === 0) return;
    const semDadosObrigatorios = linhas.filter(
      (l) =>
        !(l.bancoId || importBancoId) ||
        !(l.pessoaDivisaoId || importPessoaDivisaoId) ||
        !(l.pessoaPagouId || importPessoaPagouId),
    );
    if (semDadosObrigatorios.length > 0) {
      setErro(
        `Defina banco, divisão e quem pagou para ${semDadosObrigatorios.length} linha(s) antes de aprovar.`,
      );
      return;
    }
    setErro(null);
    const response = await fetch("/api/importacao/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bancoId: importBancoId || null,
        pessoaDivisaoId: importPessoaDivisaoId || null,
        pessoaPagouId: importPessoaPagouId || null,
        linhas: linhas.map((l) => ({
          data: l.data,
          descricaoOrigem: l.descricaoOrigem,
          descricaoPropria: l.descricaoPropria || null,
          valorCentavos: l.valorCentavos,
          descontoCentavos: l.descontoCentavos,
          categoriaId: l.categoriaId || null,
          subcategoriaId: l.subcategoriaId || null,
          bancoId: l.bancoId || null,
          pessoaDivisaoId: l.pessoaDivisaoId || null,
          pessoaPagouId: l.pessoaPagouId || null,
          ...(l.parcelaDetectada && l.usarComoParcelamento
            ? {
                usarComoParcelamento: true,
                modoParcelamento: l.modoParcelamento,
                parcelaAtual: l.parcelaDetectada.atual,
                parcelaTotal: l.parcelaDetectada.total,
              }
            : {}),
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
    const partesResumo = [`${body.criados} lançamento(s) aprovado(s)`];
    if (body.parcelamentosCriados)
      partesResumo.push(`${body.parcelamentosCriados} parcelamento(s) novo(s)`);
    if (body.parcelasAnexadas)
      partesResumo.push(
        `${body.parcelasAnexadas} parcela(s) anexada(s) a parcelamentos existentes`,
      );
    if (body.duplicadosIgnorados)
      partesResumo.push(`${body.duplicadosIgnorados} duplicado(s) ignorado(s)`);
    setToast(partesResumo.join(", ") + ".");
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

  const camposImportacaoPreenchidos = Boolean(importTemplateId);

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

  return (
    <div className="gap-lg flex flex-col">
      {dialogConfirmacao}

      <LancamentosHeader
        quantidadeLinhasImportacaoPendentes={linhasRevisao.length}
        onNovoLancamento={abrirModalNovo}
        onImportar={abrirModalImportar}
        onParcelamentosAlterados={carregar}
        refreshSignalParcelamentos={reloadPainelParcelamentos}
      />

      {toast && (
        <div className="bottom-lg right-lg bg-primary px-md text-on-primary fixed z-50 flex items-center gap-2 rounded-xl py-2.5 text-sm font-medium shadow-lg">
          <span aria-hidden>✓</span> {toast}
        </div>
      )}

      {erro && !modalNovoAberto && !modalImportarAberto && (
        <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
          {erro}
        </p>
      )}

      {modalNovoAberto && (
        <NovoLancamentoModal
          form={form}
          onChangeForm={setForm}
          categorias={categorias}
          subcategoriasDaCategoriaSelecionada={
            subcategoriasDaCategoriaSelecionada
          }
          bancos={bancos}
          pessoas={pessoas}
          investimentos={investimentos}
          erro={erro}
          onFechar={fecharModalNovo}
          onSubmit={criarLancamento}
          onSelecionarSugestaoDescricao={aoSelecionarSugestaoDescricao}
        />
      )}

      {modalImportarAberto && (
        <ImportarLancamentosModal
          etapa={etapaImportacao}
          onMudarEtapa={setEtapaImportacao}
          erro={erro}
          onFechar={fecharModalImportar}
          bancos={bancos}
          pessoas={pessoas}
          pessoasPorId={pessoasPorId}
          categorias={categorias}
          templates={templates}
          importBancoId={importBancoId}
          onMudarImportBancoId={setImportBancoId}
          importTemplateId={importTemplateId}
          onMudarImportTemplateId={setImportTemplateId}
          importPessoaDivisaoId={importPessoaDivisaoId}
          onMudarImportPessoaDivisaoId={setImportPessoaDivisaoId}
          importPessoaPagouId={importPessoaPagouId}
          onMudarImportPessoaPagouId={setImportPessoaPagouId}
          importDataInicial={importDataInicial}
          onMudarImportDataInicial={setImportDataInicial}
          onBaixarExemploModelo={baixarExemploModelo}
          resumoImportacao={resumoImportacao}
          resumoImportacaoTexto={
            resumoImportacao
              ? montarResumoImportacaoTexto(resumoImportacao)
              : ""
          }
          onLimparResumo={() => {
            setResumoImportacao(null);
            setErrosDetalheAberto(false);
            setErrosVisiveis(5);
          }}
          errosDetalheAberto={errosDetalheAberto}
          onAlternarErrosDetalhe={() => setErrosDetalheAberto((v) => !v)}
          errosVisiveis={errosVisiveis}
          onVerMaisErros={() => setErrosVisiveis((v) => v + 5)}
          camposImportacaoPreenchidos={camposImportacaoPreenchidos}
          arquivoSelecionado={arquivoSelecionado}
          arrastandoArquivo={arrastandoArquivo}
          onDragOverArquivo={() => setArrastandoArquivo(true)}
          onDragLeaveArquivo={() => setArrastandoArquivo(false)}
          onDropArquivo={onSoltarArquivo}
          onSelecionarArquivo={selecionarArquivo}
          inputArquivoRef={inputArquivoRef}
          analisando={analisando}
          onValidarEImportar={validarEImportarArquivo}
          onAbandonarImportacao={abandonarImportacao}
          linhasRevisao={linhasRevisao}
          linhasNaoDuplicadas={linhasNaoDuplicadas}
          linhasRevisaoPagina={linhasRevisaoPagina}
          acoesEmMassaAberto={acoesEmMassaAberto}
          onAlternarAcoesEmMassa={() => setAcoesEmMassaAberto((v) => !v)}
          categoriaEmMassa={categoriaEmMassa}
          onMudarCategoriaEmMassa={setCategoriaEmMassa}
          onAplicarCategoriaEmMassa={aplicarCategoriaEmMassa}
          onAprovarTudo={() =>
            confirmarLinhas(linhasNaoDuplicadas.filter((l) => l.selecionada))
          }
          onAprovarLinha={(linha) => confirmarLinhas([linha])}
          onRemoverLinha={removerLinhaRevisao}
          onAtualizarLinha={atualizarLinhaRevisao}
          paginaRevisao={paginaRevisao}
          totalPaginasRevisao={totalPaginasRevisao}
          onMudarPaginaRevisao={setPaginaRevisao}
        />
      )}

      <LancamentosTable
        anoFiltroMeses={anoFiltroMeses}
        anosDisponiveis={anosDisponiveis}
        mesFiltroSelecionado={mesFiltroSelecionado}
        onMudarAno={setAnoFiltroMeses}
        onMudarMes={setMesFiltroSelecionado}
        lancamentos={lancamentos}
        lancamentosProcessados={lancamentosProcessados}
        nome={nome}
        opcoesColunas={opcoesColunas}
        ordenacao={ordenacao}
        onOrdenar={aoOrdenarColuna}
        filtros={filtros}
        onFiltrar={aoFiltrarColuna}
        onLimparFiltro={aoLimparFiltroColuna}
        paginaLancamentos={paginaLancamentos}
        tamanhoPagina={TAMANHO_PAGINA_LANCAMENTOS}
        onMudarPagina={setPaginaLancamentos}
        pessoas={pessoas}
        categorias={categorias}
        bancos={bancos}
        investimentos={investimentos}
        parcelamentosPorId={parcelamentosPorId}
        onRemoverLancamento={removerLancamento}
        detalheId={detalheId}
        lancamentoDetalhe={lancamentoDetalhe}
        onAbrirDetalhe={setDetalheId}
        onFecharDetalhe={() => setDetalheId(null)}
        onSalvarDetalhe={(input) =>
          atualizarLancamento(lancamentoDetalhe!.id, input)
        }
      />
    </div>
  );
}
