"use client";

import { Select } from "../../components/Select";
import { formatarMoeda } from "@/lib/domain/formatacao";
import {
  MODOS_PARCELAMENTO,
  type Banco,
  type Categoria,
  type LinhaRevisao,
  type Pessoa,
} from "./types";

type Props = {
  erro: string | null;
  linhasNaoDuplicadas: LinhaRevisao[];
  linhasRevisaoPagina: LinhaRevisao[];
  linhasRevisaoTotal: number;
  categorias: Categoria[];
  bancos: Banco[];
  pessoas: Pessoa[];
  pessoasPorId: Map<string, Pessoa>;

  acoesEmMassaAberto: boolean;
  onAlternarAcoesEmMassa: () => void;
  categoriaEmMassa: string;
  onMudarCategoriaEmMassa: (v: string) => void;
  onAplicarCategoriaEmMassa: () => void;

  onAprovarTudo: () => void;
  onAprovarLinha: (linha: LinhaRevisao) => void;
  onRemoverLinha: (hash: string) => void;
  onAtualizarLinha: (hash: string, patch: Partial<LinhaRevisao>) => void;

  paginaRevisao: number;
  totalPaginasRevisao: number;
  onMudarPagina: (pagina: number) => void;
};

export function ImportRevisaoTable({
  erro,
  linhasNaoDuplicadas,
  linhasRevisaoPagina,
  linhasRevisaoTotal,
  categorias,
  bancos,
  pessoas,
  pessoasPorId,
  acoesEmMassaAberto,
  onAlternarAcoesEmMassa,
  categoriaEmMassa,
  onMudarCategoriaEmMassa,
  onAplicarCategoriaEmMassa,
  onAprovarTudo,
  onAprovarLinha,
  onRemoverLinha,
  onAtualizarLinha,
  paginaRevisao,
  totalPaginasRevisao,
  onMudarPagina,
}: Props) {
  return (
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
            onClick={onAlternarAcoesEmMassa}
            className="border-outline-variant bg-surface-container-lowest px-md text-on-surface hover:bg-surface-container-low rounded-full border py-1.5 text-xs font-semibold"
          >
            Ações em Massa
          </button>
          <button
            type="button"
            onClick={onAprovarTudo}
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
              onChange={onMudarCategoriaEmMassa}
              options={categorias.map((c) => ({
                value: c.id,
                label: c.nome,
              }))}
            />
          </div>
          <button
            type="button"
            disabled={!categoriaEmMassa}
            onClick={onAplicarCategoriaEmMassa}
            className="bg-primary px-md text-on-primary rounded-full py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={onAlternarAcoesEmMassa}
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
              const divisaoPessoa = pessoasPorId.get(linha.pessoaDivisaoId);
              const ehAjuste = linha.valorCentavos < 0;
              const tipo = ehAjuste
                ? {
                    label: "Ajuste",
                    classe: "bg-surface-container text-on-surface-variant",
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
                        onAtualizarLinha(linha.hash, {
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
                    {linha.parcelaDetectada && (
                      <div className="bg-tertiary-container/10 border-tertiary-container/30 mt-1 flex flex-col gap-1 rounded-lg border p-1.5">
                        <label className="text-tertiary-container flex items-start gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={linha.usarComoParcelamento}
                            onChange={(e) =>
                              onAtualizarLinha(linha.hash, {
                                usarComoParcelamento: e.target.checked,
                              })
                            }
                          />
                          Isso parece ser a parcela{" "}
                          {linha.parcelaDetectada.atual} de{" "}
                          {linha.parcelaDetectada.total} — importar como
                          parcelamento?
                        </label>
                        {linha.usarComoParcelamento && (
                          <Select
                            value={linha.modoParcelamento}
                            onChange={(v) =>
                              onAtualizarLinha(linha.hash, {
                                modoParcelamento: v,
                              })
                            }
                            options={MODOS_PARCELAMENTO.map((m) => ({
                              value: m.value,
                              label: m.label,
                            }))}
                          />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <Select
                      placeholder="—"
                      value={linha.categoriaId}
                      onChange={(v) =>
                        onAtualizarLinha(linha.hash, {
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
                          onAtualizarLinha(linha.hash, { subcategoriaId: v })
                        }
                        options={categoriaAtual.subcategorias.map((s) => ({
                          value: s.id,
                          label: s.nome,
                        }))}
                      />
                    )}
                    {linha.categoriaOrigem && !linha.categoriaSugeridaId && (
                      <p
                        className="text-tertiary-container mt-1 text-xs"
                        title="Texto do arquivo não corresponde a nenhuma categoria cadastrada"
                      >
                        &quot;{linha.categoriaOrigem}&quot; não encontrado
                      </p>
                    )}
                  </td>
                  <td className="p-2">
                    <Select
                      placeholder="—"
                      value={linha.bancoId}
                      onChange={(v) =>
                        onAtualizarLinha(linha.hash, { bancoId: v })
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
                        onAtualizarLinha(linha.hash, { pessoaDivisaoId: v })
                      }
                      options={pessoas.map((p) => ({
                        value: p.id,
                        label: p.nome,
                      }))}
                    />
                    {linha.divisaoOrigem && !linha.pessoaDivisaoSugeridaId && (
                      <p
                        className="text-tertiary-container mt-1 text-xs"
                        title="Texto do arquivo não corresponde a nenhuma pessoa cadastrada"
                      >
                        &quot;{linha.divisaoOrigem}&quot; não encontrado
                      </p>
                    )}
                  </td>
                  <td className="p-2">
                    <Select
                      placeholder="—"
                      value={linha.pessoaPagouId}
                      onChange={(v) =>
                        onAtualizarLinha(linha.hash, { pessoaPagouId: v })
                      }
                      options={pessoas.map((p) => ({
                        value: p.id,
                        label: p.nome,
                      }))}
                    />
                    {linha.pagouOrigem && !linha.pessoaPagouSugeridaId && (
                      <p
                        className="text-tertiary-container mt-1 text-xs"
                        title="Texto do arquivo não corresponde a nenhuma pessoa cadastrada"
                      >
                        &quot;{linha.pagouOrigem}&quot; não encontrado
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
                          onClick={() => onAprovarLinha(linha)}
                          className="text-success text-sm font-semibold"
                        >
                          ✓
                        </button>
                      )}
                      <button
                        type="button"
                        title="Remover da lista"
                        onClick={() => onRemoverLinha(linha.hash)}
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
          Mostrando {linhasRevisaoPagina.length} de {linhasRevisaoTotal}{" "}
          pendentes
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={paginaRevisao === 0}
            onClick={() => onMudarPagina(Math.max(0, paginaRevisao - 1))}
            className="border-outline-variant px-sm rounded-full border py-1 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={paginaRevisao >= totalPaginasRevisao - 1}
            onClick={() =>
              onMudarPagina(
                Math.min(totalPaginasRevisao - 1, paginaRevisao + 1),
              )
            }
            className="border-outline-variant px-sm rounded-full border py-1 disabled:opacity-40"
          >
            Próximo
          </button>
        </div>
      </div>
    </div>
  );
}
