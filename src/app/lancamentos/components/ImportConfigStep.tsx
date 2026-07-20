"use client";

import type { DragEvent, RefObject } from "react";
import { Select } from "../../components/Select";
import { inputClass } from "./types";
import type { Banco, ErroImportacao, Pessoa, Template } from "./types";

type ResumoImportacao = {
  novas: number;
  duplicadas: number;
  ignoradasAntesDoPeriodo: number;
  erros: ErroImportacao[];
};

type Props = {
  erro: string | null;
  bancos: Banco[];
  pessoas: Pessoa[];
  templates: Template[];
  importBancoId: string;
  onMudarImportBancoId: (v: string) => void;
  importTemplateId: string;
  onMudarImportTemplateId: (v: string) => void;
  importPessoaDivisaoId: string;
  onMudarImportPessoaDivisaoId: (v: string) => void;
  importPessoaPagouId: string;
  onMudarImportPessoaPagouId: (v: string) => void;
  importDataInicial: string;
  onMudarImportDataInicial: (v: string) => void;
  onBaixarExemploModelo: () => void;

  resumoImportacao: ResumoImportacao | null;
  onLimparResumo: () => void;
  errosDetalheAberto: boolean;
  onAlternarErrosDetalhe: () => void;
  errosVisiveis: number;
  onVerMaisErros: () => void;
  resumoImportacaoTexto: string;

  camposImportacaoPreenchidos: boolean;
  arquivoSelecionado: File | null;
  arrastandoArquivo: boolean;
  onDragOverArquivo: () => void;
  onDragLeaveArquivo: () => void;
  onDropArquivo: (e: DragEvent<HTMLDivElement>) => void;
  onSelecionarArquivo: (arquivo: File) => void;
  inputArquivoRef: RefObject<HTMLInputElement | null>;
};

export function ImportConfigStep({
  erro,
  bancos,
  pessoas,
  templates,
  importBancoId,
  onMudarImportBancoId,
  importTemplateId,
  onMudarImportTemplateId,
  importPessoaDivisaoId,
  onMudarImportPessoaDivisaoId,
  importPessoaPagouId,
  onMudarImportPessoaPagouId,
  importDataInicial,
  onMudarImportDataInicial,
  onBaixarExemploModelo,
  resumoImportacao,
  onLimparResumo,
  errosDetalheAberto,
  onAlternarErrosDetalhe,
  errosVisiveis,
  onVerMaisErros,
  resumoImportacaoTexto,
  camposImportacaoPreenchidos,
  arquivoSelecionado,
  arrastandoArquivo,
  onDragOverArquivo,
  onDragLeaveArquivo,
  onDropArquivo,
  onSelecionarArquivo,
  inputArquivoRef,
}: Props) {
  return (
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
            onChange={onMudarImportBancoId}
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
            onChange={onMudarImportTemplateId}
            options={templates.map((t) => ({
              value: t.id,
              label: t.nomeExibicao,
            }))}
          />
          {importTemplateId && (
            <button
              type="button"
              onClick={onBaixarExemploModelo}
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
            onChange={onMudarImportPessoaDivisaoId}
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
            onChange={onMudarImportPessoaPagouId}
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
            onChange={(e) => onMudarImportDataInicial(e.target.value)}
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
          <p className="text-on-surface font-bold">Arquivo processado</p>
          <p className="text-on-surface-variant text-sm">
            {resumoImportacaoTexto}
          </p>
          {resumoImportacao.erros.length > 0 && (
            <button
              type="button"
              onClick={onAlternarErrosDetalhe}
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
                {resumoImportacao.erros.slice(0, errosVisiveis).map((e) => (
                  <li key={e.numeroLinha}>
                    Linha {e.numeroLinha}: {e.motivo}
                  </li>
                ))}
              </ul>
              {errosVisiveis < resumoImportacao.erros.length && (
                <button
                  type="button"
                  onClick={onVerMaisErros}
                  className="text-primary mt-1 text-xs font-semibold underline"
                >
                  Ver mais ({resumoImportacao.erros.length - errosVisiveis}{" "}
                  restante
                  {resumoImportacao.erros.length - errosVisiveis > 1 ? "s" : ""}
                  )
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onLimparResumo}
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
            onDragOverArquivo();
          }}
          onDragLeave={onDragLeaveArquivo}
          onDrop={camposImportacaoPreenchidos ? onDropArquivo : undefined}
          onClick={() =>
            camposImportacaoPreenchidos && inputArquivoRef.current?.click()
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
              {arquivoSelecionado ? "Trocar arquivo" : "Procurar arquivos"}
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
              if (arquivo) onSelecionarArquivo(arquivo);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}
