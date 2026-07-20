"use client";

import type { DragEvent, RefObject } from "react";
import { ImportConfigStep } from "./ImportConfigStep";
import { ImportRevisaoTable } from "./ImportRevisaoTable";
import type {
  Banco,
  Categoria,
  ErroImportacao,
  LinhaRevisao,
  Pessoa,
  Template,
} from "./types";

type ResumoImportacao = {
  novas: number;
  duplicadas: number;
  ignoradasAntesDoPeriodo: number;
  erros: ErroImportacao[];
};

type Props = {
  etapa: "configurar" | "revisar";
  onMudarEtapa: (etapa: "configurar" | "revisar") => void;
  erro: string | null;
  onFechar: () => void;

  bancos: Banco[];
  pessoas: Pessoa[];
  pessoasPorId: Map<string, Pessoa>;
  categorias: Categoria[];
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
  resumoImportacaoTexto: string;
  onLimparResumo: () => void;
  errosDetalheAberto: boolean;
  onAlternarErrosDetalhe: () => void;
  errosVisiveis: number;
  onVerMaisErros: () => void;

  camposImportacaoPreenchidos: boolean;
  arquivoSelecionado: File | null;
  arrastandoArquivo: boolean;
  onDragOverArquivo: () => void;
  onDragLeaveArquivo: () => void;
  onDropArquivo: (e: DragEvent<HTMLDivElement>) => void;
  onSelecionarArquivo: (arquivo: File) => void;
  inputArquivoRef: RefObject<HTMLInputElement | null>;
  analisando: boolean;
  onValidarEImportar: () => void;
  onAbandonarImportacao: () => void;

  linhasRevisao: LinhaRevisao[];
  linhasNaoDuplicadas: LinhaRevisao[];
  linhasRevisaoPagina: LinhaRevisao[];
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
  onMudarPaginaRevisao: (pagina: number) => void;
};

export function ImportarLancamentosModal(props: Props) {
  const { etapa, onMudarEtapa, erro, onFechar } = props;

  return (
    <div className="bg-surface-container-lowest fixed inset-0 z-[100] flex flex-col">
      <div className="border-outline-variant p-lg flex items-center justify-between border-b">
        <h2 className="text-on-surface flex items-center gap-1.5 text-lg font-bold">
          {etapa === "revisar" ? "Revisão de Importações" : "Importar Extrato"}
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

      <div className="p-lg flex-1 overflow-y-auto">
        {etapa === "configurar" ? (
          <ImportConfigStep
            erro={erro}
            bancos={props.bancos}
            pessoas={props.pessoas}
            templates={props.templates}
            importBancoId={props.importBancoId}
            onMudarImportBancoId={props.onMudarImportBancoId}
            importTemplateId={props.importTemplateId}
            onMudarImportTemplateId={props.onMudarImportTemplateId}
            importPessoaDivisaoId={props.importPessoaDivisaoId}
            onMudarImportPessoaDivisaoId={props.onMudarImportPessoaDivisaoId}
            importPessoaPagouId={props.importPessoaPagouId}
            onMudarImportPessoaPagouId={props.onMudarImportPessoaPagouId}
            importDataInicial={props.importDataInicial}
            onMudarImportDataInicial={props.onMudarImportDataInicial}
            onBaixarExemploModelo={props.onBaixarExemploModelo}
            resumoImportacao={props.resumoImportacao}
            onLimparResumo={props.onLimparResumo}
            errosDetalheAberto={props.errosDetalheAberto}
            onAlternarErrosDetalhe={props.onAlternarErrosDetalhe}
            errosVisiveis={props.errosVisiveis}
            onVerMaisErros={props.onVerMaisErros}
            resumoImportacaoTexto={props.resumoImportacaoTexto}
            camposImportacaoPreenchidos={props.camposImportacaoPreenchidos}
            arquivoSelecionado={props.arquivoSelecionado}
            arrastandoArquivo={props.arrastandoArquivo}
            onDragOverArquivo={props.onDragOverArquivo}
            onDragLeaveArquivo={props.onDragLeaveArquivo}
            onDropArquivo={props.onDropArquivo}
            onSelecionarArquivo={props.onSelecionarArquivo}
            inputArquivoRef={props.inputArquivoRef}
          />
        ) : props.linhasRevisao.length === 0 ? (
          <div className="gap-sm flex flex-col items-center justify-center py-16 text-center">
            <p className="text-on-surface font-bold">
              Nenhuma linha pendente de revisão.
            </p>
            <button
              type="button"
              onClick={() => onMudarEtapa("configurar")}
              className="bg-primary px-lg text-on-primary rounded-full py-2 text-sm font-semibold hover:opacity-90"
            >
              Importar um arquivo
            </button>
          </div>
        ) : (
          <ImportRevisaoTable
            erro={erro}
            linhasNaoDuplicadas={props.linhasNaoDuplicadas}
            linhasRevisaoPagina={props.linhasRevisaoPagina}
            linhasRevisaoTotal={props.linhasRevisao.length}
            categorias={props.categorias}
            bancos={props.bancos}
            pessoas={props.pessoas}
            pessoasPorId={props.pessoasPorId}
            acoesEmMassaAberto={props.acoesEmMassaAberto}
            onAlternarAcoesEmMassa={props.onAlternarAcoesEmMassa}
            categoriaEmMassa={props.categoriaEmMassa}
            onMudarCategoriaEmMassa={props.onMudarCategoriaEmMassa}
            onAplicarCategoriaEmMassa={props.onAplicarCategoriaEmMassa}
            onAprovarTudo={props.onAprovarTudo}
            onAprovarLinha={props.onAprovarLinha}
            onRemoverLinha={props.onRemoverLinha}
            onAtualizarLinha={props.onAtualizarLinha}
            paginaRevisao={props.paginaRevisao}
            totalPaginasRevisao={props.totalPaginasRevisao}
            onMudarPagina={props.onMudarPaginaRevisao}
          />
        )}
      </div>

      <div className="border-outline-variant p-lg flex items-center justify-end gap-2 border-t">
        {etapa === "configurar" ? (
          <>
            <button
              type="button"
              onClick={onFechar}
              className="border-outline-variant bg-surface-container-lowest px-lg text-on-surface hover:bg-surface-container-low rounded-full border py-2 text-sm font-semibold"
            >
              {props.resumoImportacao ? "Fechar" : "Cancelar"}
            </button>
            {props.resumoImportacao ? (
              <button
                type="button"
                onClick={() => onMudarEtapa("revisar")}
                className="bg-primary px-lg text-on-primary rounded-full py-2 text-sm font-semibold hover:opacity-90"
              >
                Ir para revisão
              </button>
            ) : (
              <button
                type="button"
                onClick={props.onValidarEImportar}
                disabled={
                  !props.camposImportacaoPreenchidos ||
                  !props.arquivoSelecionado ||
                  props.analisando
                }
                className="bg-primary px-lg text-on-primary rounded-full py-2 text-sm font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {props.analisando ? "Validando…" : "Validar e Importar"}
              </button>
            )}
          </>
        ) : (
          <>
            {props.linhasRevisao.length > 0 && (
              <button
                type="button"
                onClick={props.onAbandonarImportacao}
                className="text-danger px-lg mr-auto py-2 text-sm font-semibold hover:underline"
              >
                Cancelar importação
              </button>
            )}
            <button
              type="button"
              onClick={() => onMudarEtapa("configurar")}
              className="border-outline-variant bg-surface-container-lowest px-lg text-on-surface hover:bg-surface-container-low rounded-full border py-2 text-sm font-semibold"
            >
              + Adicionar mais arquivos
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="bg-primary px-lg text-on-primary rounded-full py-2 text-sm font-semibold hover:opacity-90"
            >
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
