"use client";

import { useEffect, useState } from "react";

type Banco = { id: string; nome: string; ativo: boolean };
type Pessoa = { id: string; nome: string };
type Subcategoria = {
  id: string;
  nome: string;
  categoriaId: string;
  ativo: boolean;
};
type Categoria = {
  id: string;
  nome: string;
  ativo: boolean;
  subcategorias: Subcategoria[];
};
type Template = { id: string; nomeExibicao: string; descricao: string };

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

type LinhaEditavel = LinhaPreview & {
  selecionada: boolean;
  categoriaId: string;
  subcategoriaId: string;
};

async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível completar a operação.";
}

function formatarCentavos(valorCentavos: number): string {
  return (valorCentavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ImportacaoClient() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [naoAutenticado, setNaoAutenticado] = useState(false);

  const [bancoId, setBancoId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [pessoaDivisaoId, setPessoaDivisaoId] = useState("");
  const [pessoaPagouId, setPessoaPagouId] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  const [linhas, setLinhas] = useState<LinhaEditavel[] | null>(null);
  const [erros, setErros] = useState<ErroImportacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<{
    criados: number;
    duplicadosIgnorados: number;
  } | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function carregarCadastros() {
      const [resBancos, resPessoas, resCategorias, resTemplates] =
        await Promise.all([
          fetch("/api/bancos"),
          fetch("/api/pessoas"),
          fetch("/api/categorias"),
          fetch("/api/importacao/templates"),
        ]);
      if (cancelado) return;
      if (
        resBancos.status === 401 ||
        resPessoas.status === 401 ||
        resCategorias.status === 401
      ) {
        setNaoAutenticado(true);
        return;
      }
      setBancos(await resBancos.json());
      setPessoas(await resPessoas.json());
      setCategorias(await resCategorias.json());
      setTemplates(await resTemplates.json());
    }

    carregarCadastros().catch(() => {
      if (!cancelado) setErro("Não foi possível carregar os cadastros.");
    });

    return () => {
      cancelado = true;
    };
  }, []);

  async function analisarCsv(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setResultado(null);
    if (!arquivo) {
      setErro("Selecione um arquivo CSV.");
      return;
    }
    setCarregando(true);
    try {
      const csv = await arquivo.text();
      const response = await fetch("/api/importacao/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bancoId, templateId, csv }),
      });
      if (!response.ok) {
        setErro(await parseErro(response));
        setLinhas(null);
        return;
      }
      const body = await response.json();
      setErros(body.erros ?? []);
      setLinhas(
        (body.linhas as LinhaPreview[]).map((linha) => ({
          ...linha,
          selecionada: !linha.duplicado,
          categoriaId: linha.categoriaSugeridaId ?? "",
          subcategoriaId: linha.subcategoriaSugeridaId ?? "",
        })),
      );
    } finally {
      setCarregando(false);
    }
  }

  function atualizarLinha(hash: string, patch: Partial<LinhaEditavel>) {
    setLinhas(
      (atual) =>
        atual?.map((l) => (l.hash === hash ? { ...l, ...patch } : l)) ?? null,
    );
  }

  async function confirmarImportacao() {
    if (!linhas) return;
    setErro(null);
    const selecionadas = linhas.filter((l) => l.selecionada);
    if (selecionadas.length === 0) {
      setErro("Selecione ao menos uma linha para importar.");
      return;
    }
    setCarregando(true);
    try {
      const response = await fetch("/api/importacao/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bancoId,
          pessoaDivisaoId,
          pessoaPagouId,
          linhas: selecionadas.map((l) => ({
            data: l.data,
            descricaoOrigem: l.descricaoOrigem,
            valorCentavos: l.valorCentavos,
            categoriaId: l.categoriaId || null,
            subcategoriaId: l.subcategoriaId || null,
          })),
        }),
      });
      if (!response.ok) {
        setErro(await parseErro(response));
        return;
      }
      const body = await response.json();
      setResultado({
        criados: body.criados,
        duplicadosIgnorados: body.duplicadosIgnorados,
      });
      setLinhas(null);
      setArquivo(null);
    } finally {
      setCarregando(false);
    }
  }

  if (naoAutenticado) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">
        Não autenticado — faça login para importar lançamentos.
      </p>
    );
  }

  const podeAnalisar = bancoId && templateId && arquivo;

  return (
    <div className="flex flex-col gap-6">
      {erro && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      {resultado && (
        <p className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800">
          {resultado.criados} lançamento(s) importado(s).{" "}
          {resultado.duplicadosIgnorados > 0 &&
            `${resultado.duplicadosIgnorados} duplicado(s) ignorado(s).`}
        </p>
      )}

      <form
        onSubmit={analisarCsv}
        className="flex flex-col gap-3 rounded border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="banco">
              Banco / meio de pagamento
            </label>
            <select
              id="banco"
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              value={bancoId}
              onChange={(e) => setBancoId(e.target.value)}
              required
            >
              <option value="">Selecione...</option>
              {bancos
                .filter((b) => b.ativo)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="template">
              Modelo do CSV
            </label>
            <select
              id="template"
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              required
            >
              <option value="">Selecione...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nomeExibicao}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="pessoa-divisao">
              Divisão (dono do gasto)
            </label>
            <select
              id="pessoa-divisao"
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              value={pessoaDivisaoId}
              onChange={(e) => setPessoaDivisaoId(e.target.value)}
              required
            >
              <option value="">Selecione...</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="pessoa-pagou">
              Quem pagou
            </label>
            <select
              id="pessoa-pagou"
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              value={pessoaPagouId}
              onChange={(e) => setPessoaPagouId(e.target.value)}
              required
            >
              <option value="">Selecione...</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {templateId && (
          <p className="text-xs text-zinc-500">
            {templates.find((t) => t.id === templateId)?.descricao}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="arquivo">
            Arquivo CSV
          </label>
          <input
            id="arquivo"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
        </div>

        <button
          type="submit"
          disabled={!podeAnalisar || carregando}
          className="w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Analisar CSV
        </button>
      </form>

      {erros.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">
            {erros.length} linha(s) não puderam ser lidas:
          </p>
          <ul className="list-inside list-disc">
            {erros.map((e) => (
              <li key={e.numeroLinha}>
                Linha {e.numeroLinha}: {e.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {linhas && (
        <div className="flex flex-col gap-3">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
                <th className="p-2"></th>
                <th className="p-2">Data</th>
                <th className="p-2">Descrição</th>
                <th className="p-2">Valor</th>
                <th className="p-2">Categoria</th>
                <th className="p-2">Subcategoria</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => {
                const categoriaAtual = categorias.find(
                  (c) => c.id === linha.categoriaId,
                );
                return (
                  <tr
                    key={linha.hash}
                    className={`border-b border-zinc-100 dark:border-zinc-900 ${
                      linha.duplicado ? "opacity-50" : ""
                    }`}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={linha.selecionada}
                        disabled={linha.duplicado}
                        onChange={(e) =>
                          atualizarLinha(linha.hash, {
                            selecionada: e.target.checked,
                          })
                        }
                      />
                    </td>
                    <td className="p-2">{linha.data}</td>
                    <td className="p-2">
                      {linha.descricaoOrigem}
                      {linha.duplicado && (
                        <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                          já importado
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      {formatarCentavos(linha.valorCentavos)}
                    </td>
                    <td className="p-2">
                      <select
                        className="rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                        value={linha.categoriaId}
                        onChange={(e) =>
                          atualizarLinha(linha.hash, {
                            categoriaId: e.target.value,
                            subcategoriaId: "",
                          })
                        }
                      >
                        <option value="">—</option>
                        {categorias
                          .filter((c) => c.ativo)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        className="rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                        value={linha.subcategoriaId}
                        disabled={!categoriaAtual}
                        onChange={(e) =>
                          atualizarLinha(linha.hash, {
                            subcategoriaId: e.target.value,
                          })
                        }
                      >
                        <option value="">—</option>
                        {categoriaAtual?.subcategorias
                          .filter((s) => s.ativo)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nome}
                            </option>
                          ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button
            onClick={confirmarImportacao}
            disabled={carregando}
            className="w-fit rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Confirmar importação
          </button>
        </div>
      )}
    </div>
  );
}
