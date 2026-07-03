// Modelos de coluna para os formatos de CSV exportados pelos bancos mais
// comuns. Como cada banco muda o layout de exportação com o tempo, os
// modelos abaixo cobrem os formatos documentados publicamente por cada
// instituição; o modelo "generico" serve de fallback para qualquer CSV
// simples (data, descrição, valor) e a tela de importação permite
// conferir o preview antes de confirmar.
export type ImportTemplateId =
  | "generico"
  | "nubank_cartao"
  | "nubank_conta"
  | "itau_extrato"
  | "bradesco_extrato"
  | "bb_extrato";

type ColunaValor =
  // Uma única coluna de valor; despesaPositiva indica se, no arquivo,
  // despesas já vêm como número positivo (ex.: fatura de cartão) ou
  // negativo (ex.: extrato de conta, onde saída é negativa).
  | { modo: "unica"; coluna: string; despesaPositiva: boolean }
  // Colunas separadas de crédito e débito (comum em extratos de conta).
  | { modo: "creditoDebito"; colunaCredito: string; colunaDebito: string }
  // Uma coluna de valor sem sinal + uma coluna indicadora do tipo de
  // lançamento (ex.: Banco do Brasil: "Valor" + "Tipo Lançamento").
  | {
      modo: "comIndicador";
      colunaValor: string;
      colunaIndicador: string;
      indicadoresDespesa: string[];
    };

export type ImportTemplate = {
  id: ImportTemplateId;
  nomeExibicao: string;
  descricao: string;
  delimitador: string;
  colunaData: string;
  colunaDescricao: string;
  formatoData: "ISO" | "BR";
  separadorDecimalVirgula: boolean;
  valor: ColunaValor;
};

export const IMPORT_TEMPLATES: Record<ImportTemplateId, ImportTemplate> = {
  generico: {
    id: "generico",
    nomeExibicao: "Genérico (data, descrição, valor)",
    descricao:
      "CSV simples com colunas data, descricao, valor. Use quando o banco não tiver um modelo específico.",
    delimitador: ",",
    colunaData: "data",
    colunaDescricao: "descricao",
    formatoData: "ISO",
    separadorDecimalVirgula: false,
    valor: { modo: "unica", coluna: "valor", despesaPositiva: true },
  },
  nubank_cartao: {
    id: "nubank_cartao",
    nomeExibicao: "Nubank — Cartão de crédito (fatura)",
    descricao: 'Exportação "date,title,amount" da fatura do cartão Nubank.',
    delimitador: ",",
    colunaData: "date",
    colunaDescricao: "title",
    formatoData: "ISO",
    separadorDecimalVirgula: false,
    valor: { modo: "unica", coluna: "amount", despesaPositiva: true },
  },
  nubank_conta: {
    id: "nubank_conta",
    nomeExibicao: "Nubank — Conta (NuConta)",
    descricao:
      'Exportação "Data,Valor,Identificador,Descrição" do extrato da NuConta.',
    delimitador: ",",
    colunaData: "Data",
    colunaDescricao: "Descrição",
    formatoData: "BR",
    separadorDecimalVirgula: false,
    valor: { modo: "unica", coluna: "Valor", despesaPositiva: false },
  },
  itau_extrato: {
    id: "itau_extrato",
    nomeExibicao: "Itaú — Extrato conta corrente",
    descricao: 'Exportação "data;lançamento;valor;saldo" do extrato Itaú.',
    delimitador: ";",
    colunaData: "data",
    colunaDescricao: "lançamento",
    formatoData: "BR",
    separadorDecimalVirgula: true,
    valor: { modo: "unica", coluna: "valor", despesaPositiva: false },
  },
  bradesco_extrato: {
    id: "bradesco_extrato",
    nomeExibicao: "Bradesco — Extrato conta corrente",
    descricao:
      'Exportação com colunas "Data,Histórico,Crédito (R$),Débito (R$)" do extrato Bradesco.',
    delimitador: ",",
    colunaData: "Data",
    colunaDescricao: "Histórico",
    formatoData: "BR",
    separadorDecimalVirgula: true,
    valor: {
      modo: "creditoDebito",
      colunaCredito: "Crédito (R$)",
      colunaDebito: "Débito (R$)",
    },
  },
  bb_extrato: {
    id: "bb_extrato",
    nomeExibicao: "Banco do Brasil — Extrato conta corrente",
    descricao:
      'Exportação com colunas "Data,Histórico,Valor,Tipo Lançamento" do extrato BB.',
    delimitador: ",",
    colunaData: "Data",
    colunaDescricao: "Histórico",
    formatoData: "BR",
    separadorDecimalVirgula: true,
    valor: {
      modo: "comIndicador",
      colunaValor: "Valor",
      colunaIndicador: "Tipo Lançamento",
      indicadoresDespesa: ["D", "Débito", "DÉBITO"],
    },
  },
};

export function listarTemplates(): ImportTemplate[] {
  return Object.values(IMPORT_TEMPLATES);
}

export function buscarTemplate(id: string): ImportTemplate | null {
  return (IMPORT_TEMPLATES as Record<string, ImportTemplate>)[id] ?? null;
}
