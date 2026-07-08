"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { corPessoa, corPessoaSvg } from "../components/PessoaBadge";
import { ColumnHeader } from "../components/ColumnHeader";
import { useTabela, type ColunaTabela } from "../components/useTabela";

const SUBTIPOS_RECEITA = [
  { value: "SALARIO", label: "Salário", Icone: IconeSalario },
  { value: "VOUCHER", label: "Voucher", Icone: IconeVoucher },
  { value: "INVESTIMENTO", label: "Investimento", Icone: IconeInvestimento },
  { value: "OUTROS", label: "Outros", Icone: IconeOutros },
] as const;

type SubtipoReceita = (typeof SUBTIPOS_RECEITA)[number]["value"];

function infoSubtipo(subtipo: string) {
  return (
    SUBTIPOS_RECEITA.find((s) => s.value === subtipo) ?? SUBTIPOS_RECEITA[3]
  );
}

type Pessoa = { id: string; nome: string };

type Receita = {
  id: string;
  pessoaId: string;
  subtipo: SubtipoReceita;
  descricao: string | null;
  valorCentavos: number;
  mes: string;
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
  const n = Number(valor.replace(",", "."));
  return Math.round(n * 100);
}

function formatarMoeda(valorCentavos: number): string {
  return (valorCentavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarMoedaCompacta(valorCentavos: number): string {
  return (valorCentavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

// "2026-07-01T00:00:00.000Z" -> "2026-07"
function mesParaInputMonth(mes: string): string {
  return mes.slice(0, 7);
}

// "2026-07" -> "Julho 2026"
function formatarMesAno(mesInput: string): string {
  const [ano, mesNum] = mesInput.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mesNum - 1, 1));
  const nome = data.toLocaleDateString("pt-BR", {
    month: "long",
    timeZone: "UTC",
  });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} ${ano}`;
}

const MESES_INICIAIS = 2;

const NOMES_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const NOMES_MES_ABREV = [
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

type ModoVisualizacao = "mensal" | "anual";

function GraficoTotalPorPessoaEMes({
  dados,
  pessoas,
  nomePessoa,
}: {
  dados: { mes: number; porPessoa: Record<string, number> }[];
  pessoas: Pessoa[];
  nomePessoa: (id: string) => string;
}) {
  const largura = 760;
  const alturaBarras = 200;
  const margemLabel = 24;
  const margemTopo = 34;
  const altura = margemTopo + alturaBarras + margemLabel;
  const padding = 8;
  const maxValor = Math.max(
    1,
    ...dados.flatMap((d) => pessoas.map((p) => d.porPessoa[p.id] ?? 0)),
  );

  const larguraCluster = (largura - 2 * padding) / dados.length;
  const larguraBarra =
    pessoas.length > 0
      ? (larguraCluster * 0.7) / pessoas.length
      : larguraCluster * 0.7;
  const gapCluster = larguraCluster * 0.3;
  const baseline = margemTopo + alturaBarras - padding;

  return (
    <div className="flex flex-col gap-sm">
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className="w-full"
        preserveAspectRatio="none"
      >
        <line
          x1={padding}
          y1={baseline}
          x2={largura - padding}
          y2={baseline}
          stroke="var(--color-outline-variant)"
          strokeWidth={1}
        />
        {dados.map((d, iMes) => {
          const xCluster = padding + iMes * larguraCluster + gapCluster / 2;
          return (
            <g key={d.mes}>
              {pessoas.map((p, iPessoa) => {
                const valor = d.porPessoa[p.id] ?? 0;
                const alturaBarra =
                  (valor / maxValor) * (alturaBarras - 2 * padding - 16);
                const x = xCluster + iPessoa * larguraBarra;
                const y = baseline - alturaBarra;
                return (
                  <g key={p.id}>
                    <rect
                      x={x}
                      y={y}
                      width={Math.max(larguraBarra - 2, 1)}
                      height={alturaBarra}
                      fill={corPessoaSvg(p.id)}
                      rx={2}
                    >
                      <title>
                        {`${nomePessoa(p.id)} — ${NOMES_MES_ABREV[d.mes - 1]}: ${formatarMoeda(valor)}`}
                      </title>
                    </rect>
                    {valor > 0 && (
                      <text
                        x={x + Math.max(larguraBarra - 2, 1) / 2}
                        y={y - 3}
                        textAnchor="start"
                        fontSize={8}
                        fill="var(--color-on-surface)"
                        fontWeight={600}
                        transform={`rotate(-55, ${x + Math.max(larguraBarra - 2, 1) / 2}, ${y - 3})`}
                      >
                        {formatarMoedaCompacta(valor)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text
                x={xCluster + (larguraCluster - gapCluster) / 2}
                y={baseline + 16}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-on-surface-variant)"
              >
                {NOMES_MES_ABREV[d.mes - 1]}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-md">
        {pessoas.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: corPessoaSvg(p.id) }}
            />
            <span className="text-on-surface-variant">{p.nome}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IconeSalario({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function IconeVoucher({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 2v20" />
      <path d="M11 2v20" />
      <path d="M7 5c0 1.5-2 1.5-2 3s2 1.5 2 3-2 1.5-2 3 2 1.5 2 3" />
    </svg>
  );
}

function IconeInvestimento({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M14 8h7v7" />
    </svg>
  );
}

function IconeOutros({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2.5 12.5V2.5h10l8.09 8.08a2 2 0 0 1 0 2.83Z" />
      <circle cx="7" cy="7" r="1" />
    </svg>
  );
}

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

function IconeSalvar() {
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
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function IconeBusca() {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconeFiltro() {
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
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
    </svg>
  );
}

function IconeLapis() {
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
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function IconeCheck() {
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

function IconeX() {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function IconeLixeira() {
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
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function ReceitasClient() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [receitas, setReceitas] = useState<Receita[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [naoAutenticado, setNaoAutenticado] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const { confirmar, dialog: dialogConfirmacao } = useConfirmDialog();

  const [novaPessoaId, setNovaPessoaId] = useState("");
  const [novoSubtipo, setNovoSubtipo] = useState<SubtipoReceita>("SALARIO");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [novoMes, setNovoMes] = useState("");

  const [pessoaFiltro, setPessoaFiltro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [mesesVisiveis, setMesesVisiveis] = useState(MESES_INICIAIS);

  const hoje = new Date();
  const [modo, setModo] = useState<ModoVisualizacao>("mensal");
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);

  function irParaMesAnterior() {
    if (mes === 1) {
      setMes(12);
      setAno((a) => a - 1);
    } else {
      setMes((m) => m - 1);
    }
  }

  function irParaProximoMes() {
    if (mes === 12) {
      setMes(1);
      setAno((a) => a + 1);
    } else {
      setMes((m) => m + 1);
    }
  }

  useEffect(() => {
    setMesesVisiveis(MESES_INICIAIS);
  }, [modo, ano]);

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
    fetch("/api/pessoas")
      .then(async (response) => {
        if (cancelado) return;
        if (response.status === 401) {
          setNaoAutenticado(true);
          return;
        }
        const lista: Pessoa[] = await response.json();
        setPessoas(lista);
        setNovaPessoaId((atual) => atual || (lista[0]?.id ?? ""));
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
    fetch("/api/receitas")
      .then(async (response) => {
        if (cancelado) return;
        if (response.status === 401) {
          setNaoAutenticado(true);
          return;
        }
        setNaoAutenticado(false);
        setReceitas(await response.json());
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar as receitas.");
      });
    return () => {
      cancelado = true;
    };
  }, [reloadToken]);

  const nomePessoa = useMemo(() => {
    const mapa = new Map(pessoas.map((p) => [p.id, p.nome]));
    return (id: string) => mapa.get(id) ?? "—";
  }, [pessoas]);

  const mesSelecionadoStr = `${ano}-${String(mes).padStart(2, "0")}`;

  const totalDoMes = useMemo(() => {
    if (!receitas) return 0;
    return receitas
      .filter((r) => mesParaInputMonth(r.mes) === mesSelecionadoStr)
      .reduce((soma, r) => soma + r.valorCentavos, 0);
  }, [receitas, mesSelecionadoStr]);

  const totalDoAno = useMemo(() => {
    if (!receitas) return 0;
    return receitas
      .filter((r) => r.mes.slice(0, 4) === String(ano))
      .reduce((soma, r) => soma + r.valorCentavos, 0);
  }, [receitas, ano]);

  const dadosGraficoAnual = useMemo(() => {
    if (!receitas) return [];
    const porMes: Record<number, Record<string, number>> = {};
    for (let m = 1; m <= 12; m++) porMes[m] = {};
    for (const r of receitas) {
      if (r.mes.slice(0, 4) !== String(ano)) continue;
      const mesNum = Number(r.mes.slice(5, 7));
      porMes[mesNum][r.pessoaId] =
        (porMes[mesNum][r.pessoaId] ?? 0) + r.valorCentavos;
    }
    return Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      porPessoa: porMes[i + 1],
    }));
  }, [receitas, ano]);

  const receitasFiltradas = useMemo(() => {
    if (!receitas) return [];
    const buscaLower = busca.trim().toLowerCase();
    return receitas.filter((r) => {
      if (modo === "mensal") {
        if (mesParaInputMonth(r.mes) !== mesSelecionadoStr) return false;
      } else if (r.mes.slice(0, 4) !== String(ano)) {
        return false;
      }
      if (pessoaFiltro && r.pessoaId !== pessoaFiltro) return false;
      if (!buscaLower) return true;
      const campos = [
        r.descricao ?? "",
        infoSubtipo(r.subtipo).label,
        nomePessoa(r.pessoaId),
      ];
      return campos.some((campo) => campo.toLowerCase().includes(buscaLower));
    });
  }, [receitas, modo, ano, mesSelecionadoStr, pessoaFiltro, busca, nomePessoa]);

  const receitasOrdenadas = useMemo(() => {
    const copia = [...receitasFiltradas];
    copia.sort((a, b) => -a.mes.localeCompare(b.mes));
    return copia;
  }, [receitasFiltradas]);

  const mesesDistintos = useMemo(() => {
    const vistos = new Set<string>();
    const ordem: string[] = [];
    for (const r of receitasOrdenadas) {
      const chave = mesParaInputMonth(r.mes);
      if (!vistos.has(chave)) {
        vistos.add(chave);
        ordem.push(chave);
      }
    }
    return ordem;
  }, [receitasOrdenadas]);

  const mesesExibidos = new Set(mesesDistintos.slice(0, mesesVisiveis));
  const receitasExibidas = receitasOrdenadas.filter((r) =>
    mesesExibidos.has(mesParaInputMonth(r.mes)),
  );
  const haMaisMeses =
    modo === "anual" && mesesDistintos.length > mesesVisiveis;

  const colunasReceitas = useMemo<ColunaTabela<Receita>[]>(
    () => [
      {
        chave: "responsavel",
        tipo: "opcoes",
        acessor: (r) => nomePessoa(r.pessoaId),
      },
      {
        chave: "categoria",
        tipo: "opcoes",
        acessor: (r) => infoSubtipo(r.subtipo).label,
      },
      { chave: "descricao", tipo: "texto", acessor: (r) => r.descricao ?? "" },
      {
        chave: "mes",
        tipo: "opcoes",
        acessor: (r) => formatarMesAno(mesParaInputMonth(r.mes)),
      },
      { chave: "valor", tipo: "numero", acessor: (r) => r.valorCentavos / 100 },
    ],
    [nomePessoa],
  );

  const {
    linhas: receitasParaExibir,
    ordenacao,
    alternarOrdenacao,
    filtros,
    definirFiltro,
    limparFiltro,
  } = useTabela(receitasExibidas, colunasReceitas);

  const opcoesColunasReceitas = useMemo(() => {
    const unicos = (valores: string[]) =>
      [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      responsavel: unicos(receitasExibidas.map((r) => nomePessoa(r.pessoaId))),
      categoria: unicos(
        receitasExibidas.map((r) => infoSubtipo(r.subtipo).label),
      ),
      mes: unicos(
        receitasExibidas.map((r) => formatarMesAno(mesParaInputMonth(r.mes))),
      ),
    };
  }, [receitasExibidas, nomePessoa]);

  async function criarReceita(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const response = await fetch("/api/receitas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pessoaId: novaPessoaId,
        subtipo: novoSubtipo,
        descricao: novaDescricao.trim() === "" ? null : novaDescricao,
        valorCentavos: reaisParaCentavos(novoValor),
        mes: `${novoMes}-01`,
      }),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    setNovoValor("");
    setNovaDescricao("");
    setToast("Receita salva com sucesso!");
    carregar();
  }

  async function atualizarReceita(
    id: string,
    input: Partial<{
      pessoaId: string;
      subtipo: SubtipoReceita;
      descricao: string | null;
      valorCentavos: number;
      mes: string;
    }>,
  ) {
    setErro(null);
    const response = await fetch(`/api/receitas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return false;
    }
    carregar();
    return true;
  }

  async function removerReceita(receita: Receita) {
    if (
      !(await confirmar("Remover essa receita? Essa ação não pode ser desfeita."))
    ) {
      return;
    }
    setErro(null);
    const response = await fetch(`/api/receitas/${receita.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    carregar();
  }

  if (naoAutenticado) {
    return (
      <p className="text-on-surface-variant">
        Não autenticado — faça login para gerenciar receitas.
      </p>
    );
  }

  const cardClass =
    "rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm";
  const inputClass =
    "rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-1.5 text-sm focus:border-primary focus:outline-none";
  const botaoSetaClass =
    "flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary";
  const botaoToggleClass = (ativo: boolean) =>
    `rounded-full px-md py-1.5 text-sm font-semibold transition-colors ${ativo
      ? "bg-primary text-on-primary"
      : "text-on-surface-variant hover:text-on-surface"
    }`;

  return (
    <div className="flex flex-col gap-lg">
      {dialogConfirmacao}

      {toast && (
        <div className="fixed bottom-lg right-lg z-50 flex items-center gap-2 rounded-xl bg-primary px-md py-2.5 text-sm font-medium text-on-primary shadow-lg">
          <span aria-hidden>✓</span> {toast}
        </div>
      )}

      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger-container p-sm text-sm text-on-danger-container">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Receitas</h1>
          <p className="text-sm text-on-surface-variant">
            Salários, vouchers e outras entradas por pessoa e mês. Gestão
            colaborativa para o nosso lar.
          </p>
        </div>
        <div className="flex gap-sm">
          <div className="flex flex-col gap-1 rounded-xl bg-primary px-lg py-3 text-on-primary">
            <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
              Total do Mês ({NOMES_MES[mes - 1]})
            </span>
            <span className="data-tabular text-2xl font-bold">
              {formatarMoeda(totalDoMes)}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-xl bg-surface-container-high px-lg py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              Total do Ano ({ano})
            </span>
            <span className="data-tabular text-2xl font-bold text-on-tertiary-container">
              {formatarMoeda(totalDoAno)}
            </span>
          </div>
        </div>
      </div>

      <div className={`${cardClass} p-lg`}>
        <h2 className="mb-md text-base font-bold text-on-surface">
          Total por Pessoa e Mês ({ano})
        </h2>
        {pessoas.length > 0 && receitas ? (
          <GraficoTotalPorPessoaEMes
            dados={dadosGraficoAnual}
            pessoas={pessoas}
            nomePessoa={nomePessoa}
          />
        ) : (
          <p className="text-sm text-on-surface-variant">
            Sem dados suficientes para exibir o gráfico.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-center gap-md">
          <h2 className="text-lg font-bold text-on-surface">
            {modo === "mensal" ? `${NOMES_MES[mes - 1]} ${ano}` : `Ano de ${ano}`}
          </h2>
          {modo === "mensal" ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={irParaMesAnterior}
                aria-label="Mês anterior"
                className={botaoSetaClass}
              >
                ‹
              </button>
              <button
                onClick={irParaProximoMes}
                aria-label="Próximo mês"
                className={botaoSetaClass}
              >
                ›
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAno((a) => a - 1)}
                aria-label="Ano anterior"
                className={botaoSetaClass}
              >
                ‹
              </button>
              <button
                onClick={() => setAno((a) => a + 1)}
                aria-label="Próximo ano"
                className={botaoSetaClass}
              >
                ›
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest p-1">
          <button
            onClick={() => setModo("mensal")}
            className={botaoToggleClass(modo === "mensal")}
          >
            Mensal
          </button>
          <button
            onClick={() => setModo("anual")}
            className={botaoToggleClass(modo === "anual")}
          >
            Anual
          </button>
        </div>
      </div>

      <div className={`${cardClass} p-lg`}>
        <div className="mb-md flex items-center gap-2 border-b border-outline-variant pb-md text-on-surface">
          <IconePlusCirculo />
          <h2 className="text-base font-bold">Registrar Nova Entrada</h2>
        </div>
        <form
          onSubmit={criarReceita}
          className="flex flex-wrap items-end gap-sm"
        >
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold text-on-surface-variant"
              htmlFor="nova-pessoa"
            >
              Responsável
            </label>
            <select
              id="nova-pessoa"
              className={inputClass}
              value={novaPessoaId}
              onChange={(e) => setNovaPessoaId(e.target.value)}
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
              className="text-xs font-semibold text-on-surface-variant"
              htmlFor="novo-mes"
            >
              Referência
            </label>
            <input
              id="novo-mes"
              type="month"
              className={inputClass}
              value={novoMes}
              onChange={(e) => setNovoMes(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold text-on-surface-variant"
              htmlFor="novo-subtipo"
            >
              Tipo / Categoria
            </label>
            <select
              id="novo-subtipo"
              className={inputClass}
              value={novoSubtipo}
              onChange={(e) => setNovoSubtipo(e.target.value as SubtipoReceita)}
            >
              {SUBTIPOS_RECEITA.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold text-on-surface-variant"
              htmlFor="novo-valor"
            >
              Valor (R$)
            </label>
            <input
              id="novo-valor"
              type="number"
              step="0.01"
              placeholder="0,00"
              className={`w-32 text-right ${inputClass}`}
              value={novoValor}
              onChange={(e) => setNovoValor(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-1 min-w-[180px] flex-col gap-1">
            <label
              className="text-xs font-semibold text-on-surface-variant"
              htmlFor="nova-descricao"
            >
              Descrição (Opcional)
            </label>
            <input
              id="nova-descricao"
              placeholder="Ex: Dividendos..."
              className={inputClass}
              value={novaDescricao}
              onChange={(e) => setNovaDescricao(e.target.value)}
              required={novoSubtipo === "OUTROS"}
            />
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-full bg-primary px-md py-2 text-xs font-semibold text-on-primary hover:opacity-90"
          >
            <IconeSalvar /> Salvar Entrada
          </button>
        </form>
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-md p-lg pb-md">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-on-surface">
              Extrato Detalhado
            </h2>
            <span className="rounded-full bg-surface-container px-sm py-0.5 text-xs font-semibold text-on-surface-variant">
              {receitasFiltradas.length}{" "}
              {receitasFiltradas.length === 1
                ? "item encontrado"
                : "itens encontrados"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-sm">
            <div className="flex rounded-full border border-outline-variant p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPessoaFiltro(null)}
                className={`rounded-full px-sm py-1 transition-colors ${pessoaFiltro === null
                    ? "bg-surface-container-high text-on-surface"
                    : "text-on-surface-variant hover:text-on-surface"
                  }`}
              >
                Todos
              </button>
              {pessoas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPessoaFiltro(p.id)}
                  className={`rounded-full px-sm py-1 transition-colors ${pessoaFiltro === p.id
                      ? "bg-surface-container-high text-on-surface"
                      : "text-on-surface-variant hover:text-on-surface"
                    }`}
                >
                  {p.nome}
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant">
                <IconeBusca />
              </span>
              <input
                placeholder="Pesquisar descrição..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className={`w-56 pl-8 ${inputClass}`}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-outline-variant text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                <ColumnHeader
                  label="Responsável"
                  chave="responsavel"
                  tipo="opcoes"
                  opcoes={opcoesColunasReceitas.responsavel}
                  ordenacao={ordenacao}
                  onOrdenar={alternarOrdenacao}
                  filtro={filtros.responsavel}
                  onFiltrar={definirFiltro}
                  onLimparFiltro={limparFiltro}
                />
                <ColumnHeader
                  label="Categoria"
                  chave="categoria"
                  tipo="opcoes"
                  opcoes={opcoesColunasReceitas.categoria}
                  ordenacao={ordenacao}
                  onOrdenar={alternarOrdenacao}
                  filtro={filtros.categoria}
                  onFiltrar={definirFiltro}
                  onLimparFiltro={limparFiltro}
                />
                <ColumnHeader
                  label="Descrição"
                  chave="descricao"
                  tipo="texto"
                  ordenacao={ordenacao}
                  onOrdenar={alternarOrdenacao}
                  filtro={filtros.descricao}
                  onFiltrar={definirFiltro}
                  onLimparFiltro={limparFiltro}
                />
                <ColumnHeader
                  label="Mês"
                  chave="mes"
                  tipo="opcoes"
                  opcoes={opcoesColunasReceitas.mes}
                  ordenacao={ordenacao}
                  onOrdenar={alternarOrdenacao}
                  filtro={filtros.mes}
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
              {receitasParaExibir.map((receita) => (
                <LinhaReceita
                  key={receita.id}
                  receita={receita}
                  pessoas={pessoas}
                  nomePessoa={nomePessoa}
                  onAtualizar={atualizarReceita}
                  onRemover={removerReceita}
                />
              ))}
            </tbody>
          </table>
        </div>

        {receitasParaExibir.length === 0 && (
          <p className="p-lg text-sm text-on-surface-variant">
            {receitasExibidas.length === 0
              ? "Nenhuma receita encontrada."
              : "Nenhuma receita corresponde aos filtros das colunas."}
          </p>
        )}

        {haMaisMeses && (
          <button
            type="button"
            onClick={() => setMesesVisiveis((v) => v + MESES_INICIAIS)}
            className="w-full border-t border-outline-variant py-md text-center text-sm font-semibold text-primary hover:bg-surface-container-low"
          >
            Carregar meses anteriores
          </button>
        )}
      </div>
    </div>
  );
}

function LinhaReceita({
  receita,
  pessoas,
  nomePessoa,
  onAtualizar,
  onRemover,
}: {
  receita: Receita;
  pessoas: Pessoa[];
  nomePessoa: (id: string) => string;
  onAtualizar: (
    id: string,
    input: Partial<{
      pessoaId: string;
      subtipo: SubtipoReceita;
      descricao: string | null;
      valorCentavos: number;
      mes: string;
    }>,
  ) => Promise<boolean | undefined>;
  onRemover: (receita: Receita) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [pessoaId, setPessoaId] = useState(receita.pessoaId);
  const [subtipo, setSubtipo] = useState<SubtipoReceita>(receita.subtipo);
  const [descricao, setDescricao] = useState(receita.descricao ?? "");
  const [valor, setValor] = useState(centavosParaReais(receita.valorCentavos));
  const [mes, setMes] = useState(mesParaInputMonth(receita.mes));
  const [erroDescricao, setErroDescricao] = useState(false);

  async function salvar() {
    if (subtipo === "OUTROS" && descricao.trim() === "") {
      setErroDescricao(true);
      return;
    }
    setErroDescricao(false);
    const sucesso = await onAtualizar(receita.id, {
      pessoaId,
      subtipo,
      descricao: descricao.trim() === "" ? null : descricao,
      valorCentavos: reaisParaCentavos(valor),
      mes: `${mes}-01`,
    });
    if (sucesso) setEditando(false);
  }

  function cancelar() {
    setPessoaId(receita.pessoaId);
    setSubtipo(receita.subtipo);
    setDescricao(receita.descricao ?? "");
    setValor(centavosParaReais(receita.valorCentavos));
    setMes(mesParaInputMonth(receita.mes));
    setErroDescricao(false);
    setEditando(false);
  }

  const inputClass =
    "rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1";

  if (editando) {
    return (
      <tr className="border-b border-outline-variant/60 bg-surface-container-low">
        <td colSpan={6} className="p-sm">
          <div className="flex flex-wrap items-end gap-sm">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant">
                Responsável
              </label>
              <select
                className={inputClass}
                value={pessoaId}
                onChange={(e) => setPessoaId(e.target.value)}
              >
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant">
                Tipo / Categoria
              </label>
              <select
                className={inputClass}
                value={subtipo}
                onChange={(e) => setSubtipo(e.target.value as SubtipoReceita)}
              >
                {SUBTIPOS_RECEITA.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant">
                Descrição
              </label>
              <input
                className={`${inputClass} ${erroDescricao ? "border-danger" : ""}`}
                value={descricao}
                onChange={(e) => {
                  setDescricao(e.target.value);
                  if (erroDescricao) setErroDescricao(false);
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant">
                Mês
              </label>
              <input
                type="month"
                className={inputClass}
                value={mes}
                onChange={(e) => setMes(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant">
                Valor
              </label>
              <input
                type="number"
                step="0.01"
                className={`w-28 text-right ${inputClass}`}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-full p-1.5 text-success transition-colors hover:bg-success/15"
                onClick={salvar}
                title="Salvar"
                aria-label="Salvar"
              >
                <IconeCheck />
              </button>
              <button
                className="rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-low"
                onClick={cancelar}
                title="Cancelar"
                aria-label="Cancelar"
              >
                <IconeX />
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  const { label: labelCategoria, Icone: IconeCategoria } = infoSubtipo(
    receita.subtipo,
  );

  return (
    <tr className="border-b border-outline-variant/60 hover:bg-surface-container-low">
      <td className="p-md">
        <div className="flex items-center gap-2 font-medium text-on-surface">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${corPessoa(receita.pessoaId)}`}
          >
            {nomePessoa(receita.pessoaId).charAt(0).toUpperCase()}
          </span>
          {nomePessoa(receita.pessoaId)}
        </div>
      </td>
      <td className="p-md">
        <div className="flex items-center gap-1.5 text-on-surface-variant">
          <IconeCategoria className="h-4 w-4 text-on-surface" />
          <span className="text-on-surface">{labelCategoria}</span>
        </div>
      </td>
      <td className="p-md text-on-surface-variant">
        {receita.descricao ?? "—"}
      </td>
      <td className="p-md whitespace-nowrap text-on-surface-variant">
        {formatarMesAno(mesParaInputMonth(receita.mes))}
      </td>
      <td className="data-tabular p-md text-right font-medium">
        {formatarMoeda(receita.valorCentavos)}
      </td>
      <td className="p-md">
        <div className="flex justify-end gap-2">
          <button
            className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary/10"
            onClick={() => setEditando(true)}
            title="Editar"
            aria-label="Editar"
          >
            <IconeLapis />
          </button>
          <button
            className="rounded-full p-1.5 text-danger transition-colors hover:bg-danger-container"
            onClick={() => onRemover(receita)}
            title="Remover"
            aria-label="Remover"
          >
            <IconeLixeira />
          </button>
        </div>
      </td>
    </tr>
  );
}
