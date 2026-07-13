"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PessoaBadge } from "../components/PessoaBadge";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { ColumnHeader } from "../components/ColumnHeader";
import { Select } from "../components/Select";
import {
  DescricaoAutocomplete,
  type SugestaoDescricao,
} from "../components/DescricaoAutocomplete";
import { useTabela, type ColunaTabela } from "../components/useTabela";
import type { FiltroColuna } from "@/lib/domain/tabela";
import { buscarTemplate, gerarExemploCsv } from "@/lib/domain/import/templates";

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
  tipoGasto: string;
};

type LinhaPreview = {
  numeroLinha: number;
  data: string;
  descricaoOrigem: string;
  valorCentavos: number;
  descontoCentavos: number;
  descricaoPropria: string | null;
  hash: string;
  duplicado: boolean;
  categoriaSugeridaId: string | null;
  subcategoriaSugeridaId: string | null;
  bancoOrigem: string | null;
  categoriaOrigem: string | null;
  subcategoriaOrigem: string | null;
  divisaoOrigem: string | null;
  pagouOrigem: string | null;
  bancoSugeridoId: string | null;
  pessoaDivisaoSugeridaId: string | null;
  pessoaPagouSugeridaId: string | null;
};

type ErroImportacao = { numeroLinha: number; motivo: string };

type LinhaRevisao = LinhaPreview & {
  selecionada: boolean;
  categoriaId: string;
  subcategoriaId: string;
  bancoId: string;
  pessoaDivisaoId: string;
  pessoaPagouId: string;
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

const NOMES_MESES = [
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

// Primeiro e último dia do mês (0-indexado) no formato aceito por <input type="date">.
function intervaloDoMes(
  ano: number,
  mes: number,
): { inicio: string; fim: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return {
    inicio: `${ano}-${pad(mes + 1)}-01`,
    fim: `${ano}-${pad(mes + 1)}-${pad(ultimoDia)}`,
  };
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

const TIPOS_GASTO = [
  { value: "FIXO", label: "Fixo" },
  { value: "VARIAVEL", label: "Variável" },
  { value: "INVESTIMENTO", label: "Investimento" },
] as const;

function labelTipoGasto(tipo: string): string {
  return TIPOS_GASTO.find((t) => t.value === tipo)?.label ?? tipo;
}

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
  tipoGasto: string;
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
    tipoGasto: "VARIAVEL",
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

  const [form, setForm] = useState<FormLancamento>(formVazio({}));

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

  function validarFormLancamento(f: FormLancamento): string | null {
    if (!f.data) return "Informe a data do lançamento.";
    if (!f.bancoId) return "Selecione o banco/cartão.";
    if (!f.pessoaPagouId) return "Selecione quem pagou.";
    if (!f.pessoaDivisaoId) return "Selecione a divisão.";
    if (f.valor.trim() === "" || reaisParaCentavos(f.valor) === 0) {
      return "Informe um valor diferente de zero.";
    }
    if (f.desconto.trim() !== "" && reaisParaCentavos(f.desconto) < 0) {
      return "Desconto não pode ser negativo.";
    }
    return null;
  }

  async function criarLancamento(e: React.FormEvent) {
    e.preventDefault();
    const erroValidacao = validarFormLancamento(form);
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
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
        tipoGasto: form.tipoGasto,
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

  function resumoImportacaoTexto(r: {
    novas: number;
    duplicadas: number;
    ignoradasAntesDoPeriodo: number;
    erros: ErroImportacao[];
  }): string {
    const partes = [`${r.novas} pronto(s) para revisão`];
    if (r.duplicadas > 0) partes.push(`${r.duplicadas} duplicado(s)`);
    if (r.ignoradasAntesDoPeriodo > 0)
      partes.push(`${r.ignoradasAntesDoPeriodo} fora do período`);
    if (r.erros.length > 0)
      partes.push(`${r.erros.length} com erro de leitura`);
    return partes.join(", ") + ".";
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

  const inputClass =
    "rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-1.5 text-sm focus:border-primary focus:outline-none";

  return (
    <div className="gap-lg flex flex-col">
      {dialogConfirmacao}

      <div className="gap-sm flex items-center justify-between">
        <h1 className="text-on-surface text-2xl font-bold">Lançamentos</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={abrirModalNovo}
            className="bg-primary px-lg text-on-primary flex items-center gap-1.5 rounded-full py-2 text-sm font-semibold hover:opacity-90"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Novo Lançamento
          </button>
          <button
            type="button"
            onClick={abrirModalImportar}
            className="border-outline-variant bg-surface-container-lowest px-lg text-on-surface hover:bg-surface-container-low flex items-center gap-1.5 rounded-full border py-2 text-sm font-semibold"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3v12" />
              <path d="m7 8 5-5 5 5" />
              <path d="M5 21h14" />
            </svg>
            Importar
            {linhasRevisao.length > 0 && (
              <span className="bg-primary text-on-primary flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold">
                {linhasRevisao.length}
              </span>
            )}
          </button>
        </div>
      </div>

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
        <div
          className="bg-on-surface/40 p-lg fixed inset-0 z-[100] flex items-center justify-center"
          onClick={fecharModalNovo}
        >
          <form
            onSubmit={criarLancamento}
            onClick={(e) => e.stopPropagation()}
            className="gap-sm border-outline-variant bg-surface-container-lowest p-lg flex max-h-[85vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-on-surface flex items-center gap-1.5 text-lg font-bold">
                Novo Lançamento
              </h2>
              <button
                type="button"
                onClick={fecharModalNovo}
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

            {erro && (
              <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
                {erro}
              </p>
            )}

            <div className="gap-sm grid grid-cols-2 sm:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="l-data"
                >
                  Data <span className="text-danger">*</span>
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
                <Select
                  id="l-categoria"
                  value={form.categoriaId}
                  onChange={(v) =>
                    setForm({
                      ...form,
                      categoriaId: v,
                      subcategoriaId: SEM_CATEGORIA,
                    })
                  }
                  options={[
                    { value: SEM_CATEGORIA, label: "Nenhuma" },
                    ...categorias.map((c) => ({ value: c.id, label: c.nome })),
                  ]}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="l-subcategoria"
                >
                  Subcategoria
                </label>
                <Select
                  id="l-subcategoria"
                  value={form.subcategoriaId}
                  onChange={(v) => setForm({ ...form, subcategoriaId: v })}
                  disabled={!form.categoriaId}
                  options={[
                    { value: SEM_CATEGORIA, label: "Nenhuma" },
                    ...subcategoriasDaCategoriaSelecionada.map((s) => ({
                      value: s.id,
                      label: s.nome,
                    })),
                  ]}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="l-banco"
                >
                  Banco / Cartão <span className="text-danger">*</span>
                </label>
                <Select
                  id="l-banco"
                  value={form.bancoId}
                  onChange={(v) => setForm({ ...form, bancoId: v })}
                  options={bancos.map((b) => ({ value: b.id, label: b.nome }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-on-surface-variant text-xs font-semibold"
                htmlFor="l-descricao"
              >
                Descrição
              </label>
              <DescricaoAutocomplete
                id="l-descricao"
                className={inputClass}
                placeholder="Ex: Supermercado"
                value={form.descricaoPropria}
                onChange={(v) => setForm({ ...form, descricaoPropria: v })}
                onSelecionar={aoSelecionarSugestaoDescricao}
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-on-surface-variant text-xs font-semibold">
                Quem Pagou? <span className="text-danger">*</span>
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

            <div className="gap-sm grid grid-cols-1 sm:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="l-divisao"
                >
                  Divisão <span className="text-danger">*</span>
                </label>
                <Select
                  id="l-divisao"
                  value={form.pessoaDivisaoId}
                  onChange={(v) => setForm({ ...form, pessoaDivisaoId: v })}
                  options={pessoas.map((p) => ({
                    value: p.id,
                    label: `${p.nome}${p.tipo === "CASAL" ? " (50/50)" : ""}`,
                  }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="l-tipo-gasto"
                >
                  Tipo de gasto
                </label>
                <Select
                  id="l-tipo-gasto"
                  value={form.tipoGasto}
                  onChange={(v) => setForm({ ...form, tipoGasto: v })}
                  options={TIPOS_GASTO.map((t) => ({
                    value: t.value,
                    label: t.label,
                  }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-on-surface-variant text-xs font-semibold"
                  htmlFor="l-valor"
                >
                  Valor (R$) <span className="text-danger">*</span>
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
                  onChange={(e) =>
                    setForm({ ...form, desconto: e.target.value })
                  }
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
                  <Select
                    id="l-investimento"
                    value={form.investimentoResgateId}
                    onChange={(v) =>
                      setForm({ ...form, investimentoResgateId: v })
                    }
                    options={[
                      { value: "", label: "Não informado" },
                      ...investimentos.map((i) => ({
                        value: i.id,
                        label: i.produto,
                      })),
                    ]}
                  />
                </div>
              )}
            </div>

            <div className="border-outline-variant mt-1 flex items-center justify-end gap-2 border-t pt-3">
              <button
                type="button"
                onClick={fecharModalNovo}
                className="border-outline-variant bg-surface-container-lowest px-lg text-on-surface hover:bg-surface-container-low rounded-full border py-2 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="bg-primary px-lg text-on-primary rounded-full py-2 text-sm font-semibold hover:opacity-90"
              >
                Salvar Lançamento
              </button>
            </div>
          </form>
        </div>
      )}

      {modalImportarAberto && (
        <div className="bg-surface-container-lowest fixed inset-0 z-[100] flex flex-col">
          <div className="border-outline-variant p-lg flex items-center justify-between border-b">
            <h2 className="text-on-surface flex items-center gap-1.5 text-lg font-bold">
              {etapaImportacao === "revisar"
                ? "Revisão de Importações"
                : "Importar Extrato"}
            </h2>
            <button
              type="button"
              onClick={fecharModalImportar}
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

          <div className="p-lg flex-1 overflow-y-auto">
            {etapaImportacao === "configurar" ? (
              <div className="gap-sm mx-auto flex w-full max-w-2xl flex-col">
                {erro && (
                  <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
                    {erro}
                  </p>
                )}

                <div className="gap-sm grid grid-cols-1 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-on-surface-variant text-xs font-semibold"
                      htmlFor="i-banco"
                    >
                      Banco / Cartão{" "}
                      <span className="text-on-surface-variant font-normal">
                        (opcional)
                      </span>
                    </label>
                    <Select
                      id="i-banco"
                      placeholder="Definir por linha na revisão"
                      value={importBancoId}
                      onChange={setImportBancoId}
                      options={[
                        { value: "", label: "Definir por linha na revisão" },
                        ...bancos.map((b) => ({ value: b.id, label: b.nome })),
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-on-surface-variant text-xs font-semibold"
                      htmlFor="i-template"
                    >
                      Modelo do arquivo <span className="text-danger">*</span>
                    </label>
                    <Select
                      id="i-template"
                      value={importTemplateId}
                      onChange={setImportTemplateId}
                      options={templates.map((t) => ({
                        value: t.id,
                        label: t.nomeExibicao,
                      }))}
                    />
                    {importTemplateId && (
                      <button
                        type="button"
                        onClick={baixarExemploModelo}
                        className="text-primary self-start text-xs font-semibold underline"
                      >
                        Baixar exemplo deste modelo
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-on-surface-variant text-xs font-semibold"
                      htmlFor="i-divisão"
                    >
                      Divisão padrão{" "}
                      <span className="text-on-surface-variant font-normal">
                        (opcional)
                      </span>
                    </label>
                    <Select
                      id="i-divisão"
                      placeholder="Definir por linha na revisão"
                      value={importPessoaDivisaoId}
                      onChange={setImportPessoaDivisaoId}
                      options={[
                        { value: "", label: "Definir por linha na revisão" },
                        ...pessoas.map((p) => ({ value: p.id, label: p.nome })),
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-on-surface-variant text-xs font-semibold"
                      htmlFor="i-pagou"
                    >
                      Pagou{" "}
                      <span className="text-on-surface-variant font-normal">
                        (opcional)
                      </span>
                    </label>
                    <Select
                      id="i-pagou"
                      placeholder="Definir por linha na revisão"
                      value={importPessoaPagouId}
                      onChange={setImportPessoaPagouId}
                      options={[
                        { value: "", label: "Definir por linha na revisão" },
                        ...pessoas.map((p) => ({ value: p.id, label: p.nome })),
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-on-surface-variant text-xs font-semibold"
                      htmlFor="i-data-inicial"
                    >
                      Período inicial{" "}
                      <span className="text-on-surface-variant font-normal">
                        (opcional)
                      </span>
                    </label>
                    <input
                      id="i-data-inicial"
                      type="date"
                      className={inputClass}
                      value={importDataInicial}
                      onChange={(e) => setImportDataInicial(e.target.value)}
                    />
                    <p className="text-on-surface-variant text-xs">
                      Lançamentos anteriores a esta data são ignorados.
                    </p>
                  </div>
                </div>

                {resumoImportacao ? (
                  <div
                    className={`p-lg flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border text-center ${
                      resumoImportacao.erros.length > 0
                        ? "border-tertiary-container/30 bg-tertiary-container/10"
                        : "border-outline-variant bg-surface-container-low"
                    }`}
                  >
                    <span
                      className="bg-primary-container/20 flex h-10 w-10 items-center justify-center rounded-full text-lg"
                      aria-hidden
                    >
                      ✓
                    </span>
                    <p className="text-on-surface font-bold">
                      Arquivo processado
                    </p>
                    <p className="text-on-surface-variant text-sm">
                      {resumoImportacaoTexto(resumoImportacao)}
                    </p>
                    {resumoImportacao.erros.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setErrosDetalheAberto((v) => !v)}
                        className="text-primary text-xs font-semibold underline"
                      >
                        {errosDetalheAberto
                          ? "Ocultar erros"
                          : `Ver ${resumoImportacao.erros.length} erro(s)`}
                      </button>
                    )}
                    {errosDetalheAberto && (
                      <div className="w-full text-left">
                        <ul className="border-outline-variant bg-surface-container-lowest max-h-40 list-inside list-disc overflow-y-auto rounded-lg border p-2 text-xs">
                          {resumoImportacao.erros
                            .slice(0, errosVisiveis)
                            .map((e) => (
                              <li key={e.numeroLinha}>
                                Linha {e.numeroLinha}: {e.motivo}
                              </li>
                            ))}
                        </ul>
                        {errosVisiveis < resumoImportacao.erros.length && (
                          <button
                            type="button"
                            onClick={() => setErrosVisiveis((v) => v + 5)}
                            className="text-primary mt-1 text-xs font-semibold underline"
                          >
                            Ver mais (
                            {resumoImportacao.erros.length - errosVisiveis}{" "}
                            restante
                            {resumoImportacao.erros.length - errosVisiveis > 1
                              ? "s"
                              : ""}
                            )
                          </button>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setResumoImportacao(null);
                        setErrosDetalheAberto(false);
                        setErrosVisiveis(5);
                      }}
                      className="text-primary text-xs font-semibold underline"
                    >
                      Importar outro arquivo
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!camposImportacaoPreenchidos) return;
                      setArrastandoArquivo(true);
                    }}
                    onDragLeave={() => setArrastandoArquivo(false)}
                    onDrop={
                      camposImportacaoPreenchidos ? onSoltarArquivo : undefined
                    }
                    onClick={() =>
                      camposImportacaoPreenchidos &&
                      inputArquivoRef.current?.click()
                    }
                    className={`p-lg flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors ${
                      !camposImportacaoPreenchidos
                        ? "border-outline-variant cursor-not-allowed opacity-50"
                        : arrastandoArquivo
                          ? "border-primary bg-primary/5 cursor-pointer"
                          : "border-outline-variant cursor-pointer"
                    }`}
                  >
                    <span
                      className="bg-primary-container/20 flex h-10 w-10 items-center justify-center rounded-full text-lg"
                      aria-hidden
                    >
                      ⬆
                    </span>
                    {arquivoSelecionado ? (
                      <p className="text-on-surface font-bold">
                        {arquivoSelecionado.name}
                      </p>
                    ) : (
                      <p className="text-on-surface font-bold">Importar CSV</p>
                    )}
                    <p className="text-on-surface-variant text-xs">
                      {camposImportacaoPreenchidos
                        ? "Arraste seu extrato bancário aqui para conciliação inteligente."
                        : "Preencha os campos acima para habilitar o upload."}
                    </p>
                    {camposImportacaoPreenchidos && (
                      <span className="text-primary text-xs font-semibold underline">
                        {arquivoSelecionado
                          ? "Trocar arquivo"
                          : "Procurar arquivos"}
                      </span>
                    )}
                    <input
                      ref={inputArquivoRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      disabled={!camposImportacaoPreenchidos}
                      onChange={(e) => {
                        const arquivo = e.target.files?.[0];
                        if (arquivo) selecionarArquivo(arquivo);
                        e.target.value = "";
                      }}
                    />
                  </div>
                )}
              </div>
            ) : linhasRevisao.length === 0 ? (
              <div className="gap-sm flex flex-col items-center justify-center py-16 text-center">
                <p className="text-on-surface font-bold">
                  Nenhuma linha pendente de revisão.
                </p>
                <button
                  type="button"
                  onClick={() => setEtapaImportacao("configurar")}
                  className="bg-primary px-lg text-on-primary rounded-full py-2 text-sm font-semibold hover:opacity-90"
                >
                  Importar um arquivo
                </button>
              </div>
            ) : (
              <div className="gap-sm flex flex-col">
                {erro && (
                  <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
                    {erro}
                  </p>
                )}

                <div className="gap-sm flex flex-wrap items-center justify-between">
                  <span className="bg-secondary-container px-sm text-on-secondary-container rounded-full py-0.5 text-xs font-bold">
                    {linhasNaoDuplicadas.length} Pendentes
                  </span>
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
                      <Select
                        id="massa-categoria"
                        value={categoriaEmMassa}
                        onChange={setCategoriaEmMassa}
                        options={categorias.map((c) => ({
                          value: c.id,
                          label: c.nome,
                        }))}
                      />
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
                        <th className="p-2">Banco</th>
                        <th className="p-2">Divisão</th>
                        <th className="p-2">Pagou</th>
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
                        const divisaoPessoa = pessoasPorId.get(
                          linha.pessoaDivisaoId,
                        );
                        const ehAjuste = linha.valorCentavos < 0;
                        const tipo = ehAjuste
                          ? {
                              label: "Ajuste",
                              classe:
                                "bg-surface-container text-on-surface-variant",
                            }
                          : !linha.pessoaDivisaoId
                            ? {
                                label: "Indefinido",
                                classe:
                                  "bg-tertiary-container/20 text-tertiary-container",
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
                            <td className="p-2 whitespace-nowrap">
                              {linha.data}
                            </td>
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
                              <Select
                                placeholder="—"
                                value={linha.categoriaId}
                                onChange={(v) =>
                                  atualizarLinhaRevisao(linha.hash, {
                                    categoriaId: v,
                                    subcategoriaId: "",
                                  })
                                }
                                options={categorias.map((c) => ({
                                  value: c.id,
                                  label: c.nome,
                                }))}
                              />
                              {categoriaAtual && (
                                <Select
                                  className="mt-1"
                                  placeholder="—"
                                  value={linha.subcategoriaId}
                                  onChange={(v) =>
                                    atualizarLinhaRevisao(linha.hash, {
                                      subcategoriaId: v,
                                    })
                                  }
                                  options={categoriaAtual.subcategorias.map(
                                    (s) => ({
                                      value: s.id,
                                      label: s.nome,
                                    }),
                                  )}
                                />
                              )}
                              {linha.categoriaOrigem &&
                                !linha.categoriaSugeridaId && (
                                  <p
                                    className="text-tertiary-container mt-1 text-xs"
                                    title="Texto do arquivo não corresponde a nenhuma categoria cadastrada"
                                  >
                                    &quot;{linha.categoriaOrigem}&quot; não
                                    encontrado
                                  </p>
                                )}
                            </td>
                            <td className="p-2">
                              <Select
                                placeholder="—"
                                value={linha.bancoId}
                                onChange={(v) =>
                                  atualizarLinhaRevisao(linha.hash, {
                                    bancoId: v,
                                  })
                                }
                                options={bancos.map((b) => ({
                                  value: b.id,
                                  label: b.nome,
                                }))}
                              />
                              {linha.bancoOrigem && !linha.bancoSugeridoId && (
                                <p
                                  className="text-tertiary-container mt-1 text-xs"
                                  title="Texto do arquivo não corresponde a nenhum banco cadastrado"
                                >
                                  &quot;{linha.bancoOrigem}&quot; não encontrado
                                </p>
                              )}
                            </td>
                            <td className="p-2">
                              <Select
                                placeholder="—"
                                value={linha.pessoaDivisaoId}
                                onChange={(v) =>
                                  atualizarLinhaRevisao(linha.hash, {
                                    pessoaDivisaoId: v,
                                  })
                                }
                                options={pessoas.map((p) => ({
                                  value: p.id,
                                  label: p.nome,
                                }))}
                              />
                              {linha.divisaoOrigem &&
                                !linha.pessoaDivisaoSugeridaId && (
                                  <p
                                    className="text-tertiary-container mt-1 text-xs"
                                    title="Texto do arquivo não corresponde a nenhuma pessoa cadastrada"
                                  >
                                    &quot;{linha.divisaoOrigem}&quot; não
                                    encontrado
                                  </p>
                                )}
                            </td>
                            <td className="p-2">
                              <Select
                                placeholder="—"
                                value={linha.pessoaPagouId}
                                onChange={(v) =>
                                  atualizarLinhaRevisao(linha.hash, {
                                    pessoaPagouId: v,
                                  })
                                }
                                options={pessoas.map((p) => ({
                                  value: p.id,
                                  label: p.nome,
                                }))}
                              />
                              {linha.pagouOrigem &&
                                !linha.pessoaPagouSugeridaId && (
                                  <p
                                    className="text-tertiary-container mt-1 text-xs"
                                    title="Texto do arquivo não corresponde a nenhuma pessoa cadastrada"
                                  >
                                    &quot;{linha.pagouOrigem}&quot; não
                                    encontrado
                                  </p>
                                )}
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
                                  onClick={() =>
                                    removerLinhaRevisao(linha.hash)
                                  }
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
                    Mostrando {linhasRevisaoPagina.length} de{" "}
                    {linhasRevisao.length} pendentes
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={paginaRevisao === 0}
                      onClick={() =>
                        setPaginaRevisao((p) => Math.max(0, p - 1))
                      }
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
          </div>

          <div className="border-outline-variant p-lg flex items-center justify-end gap-2 border-t">
            {etapaImportacao === "configurar" ? (
              <>
                <button
                  type="button"
                  onClick={fecharModalImportar}
                  className="border-outline-variant bg-surface-container-lowest px-lg text-on-surface hover:bg-surface-container-low rounded-full border py-2 text-sm font-semibold"
                >
                  {resumoImportacao ? "Fechar" : "Cancelar"}
                </button>
                {resumoImportacao ? (
                  <button
                    type="button"
                    onClick={() => setEtapaImportacao("revisar")}
                    className="bg-primary px-lg text-on-primary rounded-full py-2 text-sm font-semibold hover:opacity-90"
                  >
                    Ir para revisão
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={validarEImportarArquivo}
                    disabled={
                      !camposImportacaoPreenchidos ||
                      !arquivoSelecionado ||
                      analisando
                    }
                    className="bg-primary px-lg text-on-primary rounded-full py-2 text-sm font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {analisando ? "Validando…" : "Validar e Importar"}
                  </button>
                )}
              </>
            ) : (
              <>
                {linhasRevisao.length > 0 && (
                  <button
                    type="button"
                    onClick={abandonarImportacao}
                    className="text-danger px-lg mr-auto py-2 text-sm font-semibold hover:underline"
                  >
                    Cancelar importação
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEtapaImportacao("configurar")}
                  className="border-outline-variant bg-surface-container-lowest px-lg text-on-surface hover:bg-surface-container-low rounded-full border py-2 text-sm font-semibold"
                >
                  + Adicionar mais arquivos
                </button>
                <button
                  type="button"
                  onClick={fecharModalImportar}
                  className="bg-primary px-lg text-on-primary rounded-full py-2 text-sm font-semibold hover:opacity-90"
                >
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Select
          id="f-ano"
          className="w-28"
          value={String(anoFiltroMeses)}
          onChange={(v) => setAnoFiltroMeses(Number(v))}
          options={anosDisponiveis.map((ano) => ({
            value: String(ano),
            label: String(ano),
          }))}
        />

        {NOMES_MESES.map((nomeMes, idx) => {
          const ativo = mesFiltroSelecionado === idx;
          return (
            <button
              key={nomeMes}
              type="button"
              onClick={() => setMesFiltroSelecionado(ativo ? null : idx)}
              className={
                ativo
                  ? "bg-primary px-md text-on-primary rounded-full py-1 text-xs font-semibold"
                  : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low px-md rounded-full border py-1 text-xs"
              }
            >
              {nomeMes}
            </button>
          );
        })}
      </div>

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
              <ColumnHeader
                label="Tipo de gasto"
                chave="tipoGasto"
                tipo="opcoes"
                opcoes={opcoesColunas.tipoGasto}
                ordenacao={ordenacao}
                onOrdenar={aoOrdenarColuna}
                filtro={filtros.tipoGasto}
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
                  pessoas={pessoas}
                  nome={nome}
                  onRemover={removerLancamento}
                  onAbrirDetalhe={() => setDetalheId(lancamento.id)}
                  selecionada={detalheId === lancamento.id}
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
          key={lancamentoDetalhe.id}
          lancamento={lancamentoDetalhe}
          categorias={categorias}
          bancos={bancos}
          pessoas={pessoas}
          investimentos={investimentos}
          onFechar={() => setDetalheId(null)}
          onSalvar={(input) => atualizarLancamento(lancamentoDetalhe.id, input)}
        />
      )}
    </div>
  );
}

function LinhaLancamento({
  lancamento,
  pessoas,
  nome,
  onRemover,
  onAbrirDetalhe,
  selecionada,
}: {
  lancamento: Lancamento;
  pessoas: Pessoa[];
  nome: {
    banco: (id: string) => string;
    pessoa: (id: string) => string;
    categoria: (id: string | null) => string;
    subcategoria: (id: string | null) => string;
  };
  onRemover: (lancamento: Lancamento) => Promise<boolean>;
  onAbrirDetalhe: () => void;
  selecionada: boolean;
}) {
  const valorLiquido = lancamento.valorCentavos - lancamento.descontoCentavos;
  const divisaoPessoa = pessoas.find(
    (p) => p.id === lancamento.pessoaDivisaoId,
  );

  return (
    <tr
      className={`hover:bg-surface-container-low cursor-pointer border-l-4 ${
        selecionada
          ? "border-l-primary bg-primary/5"
          : "border-outline-variant/60 border-b border-l-transparent"
      }`}
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
      <td className="p-2 whitespace-nowrap">
        {labelTipoGasto(lancamento.tipoGasto)}
      </td>
      <td className="p-2" onClick={(e) => e.stopPropagation()}>
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
  categorias,
  bancos,
  pessoas,
  investimentos,
  onFechar,
  onSalvar,
}: {
  lancamento: Lancamento;
  categorias: Categoria[];
  bancos: Banco[];
  pessoas: Pessoa[];
  investimentos: Investimento[];
  onFechar: () => void;
  onSalvar: (input: Partial<Lancamento>) => Promise<void>;
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
  const [tipoGasto, setTipoGasto] = useState(lancamento.tipoGasto);
  const [salvando, setSalvando] = useState(false);

  const subcategoriasDaCategoria =
    categorias.find((c) => c.id === categoriaId)?.subcategorias ?? [];

  async function salvar() {
    setSalvando(true);
    try {
      await onSalvar({
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
        tipoGasto,
      });
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  const inputClass =
    "rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-sm";
  const labelClass =
    "text-on-surface-variant text-xs font-semibold tracking-wide uppercase";

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

        <div className="gap-sm grid grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-data">
              Data
            </label>
            <input
              id="dt-data"
              type="date"
              className={inputClass}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-valor">
              Valor
            </label>
            <input
              id="dt-valor"
              type="number"
              step="0.01"
              className={`text-right ${inputClass}`}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="dt-descricao">
            Descrição
          </label>
          <textarea
            id="dt-descricao"
            className={`${inputClass} resize-none`}
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={lancamento.descricaoOrigem ?? ""}
          />
        </div>

        <div className="gap-sm grid grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-categoria">
              Categoria
            </label>
            <Select
              id="dt-categoria"
              value={categoriaId}
              onChange={(v) => {
                setCategoriaId(v);
                setSubcategoriaId(SEM_CATEGORIA);
              }}
              options={[
                { value: SEM_CATEGORIA, label: "Nenhuma" },
                ...categorias.map((c) => ({ value: c.id, label: c.nome })),
              ]}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-subcategoria">
              Subcategoria
            </label>
            <Select
              id="dt-subcategoria"
              value={subcategoriaId}
              onChange={setSubcategoriaId}
              disabled={!categoriaId}
              options={[
                { value: SEM_CATEGORIA, label: "Nenhuma" },
                ...subcategoriasDaCategoria.map((s) => ({
                  value: s.id,
                  label: s.nome,
                })),
              ]}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="dt-banco">
            Conta
          </label>
          <Select
            id="dt-banco"
            value={bancoId}
            onChange={setBancoId}
            options={bancos.map((b) => ({ value: b.id, label: b.nome }))}
          />
        </div>

        <div className="gap-sm grid grid-cols-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-divisao">
              Divisão
            </label>
            <Select
              id="dt-divisao"
              value={pessoaDivisaoId}
              onChange={setPessoaDivisaoId}
              options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-pagou">
              Responsável
            </label>
            <Select
              id="dt-pagou"
              value={pessoaPagouId}
              onChange={setPessoaPagouId}
              options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-tipo-gasto">
              Tipo de gasto
            </label>
            <Select
              id="dt-tipo-gasto"
              value={tipoGasto}
              onChange={setTipoGasto}
              options={TIPOS_GASTO.map((t) => ({
                value: t.value,
                label: t.label,
              }))}
            />
          </div>
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
            Pago com resgate de investimento
          </label>
        </div>
        {pagoComResgateInvestimento && (
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="dt-investimento">
              Investimento (opcional)
            </label>
            <Select
              id="dt-investimento"
              value={investimentoResgateId}
              onChange={setInvestimentoResgateId}
              options={[
                { value: "", label: "Não informado" },
                ...investimentos.map((i) => ({
                  value: i.id,
                  label: i.produto,
                })),
              ]}
            />
          </div>
        )}

        <div className="border-outline-variant pt-md mt-auto border-t">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="bg-primary px-md text-on-primary w-full rounded-full py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
