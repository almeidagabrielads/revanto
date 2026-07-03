import { linhasParaObjetos, parseCsv } from "./csv";
import type { ImportTemplate } from "./templates";

export type LinhaImportada = {
  numeroLinha: number;
  data: Date;
  descricaoOrigem: string;
  // Positivo = despesa; negativo = estorno/crédito (RF05) — já normalizado
  // conforme a convenção de sinal do template.
  valorCentavos: number;
};

export type ErroImportacao = {
  numeroLinha: number;
  motivo: string;
};

export type ResultadoParse = {
  linhas: LinhaImportada[];
  erros: ErroImportacao[];
};

function parseData(
  valor: string,
  formato: ImportTemplate["formatoData"],
): Date | null {
  if (formato === "ISO") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
    if (!match) return null;
    const [, ano, mes, dia] = match;
    return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  }

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(valor.trim());
  if (!match) return null;
  const [, dia, mes, ano] = match;
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

function parseValorCentavos(
  valorBruto: string,
  separadorDecimalVirgula: boolean,
): number | null {
  const limpo = valorBruto
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "");
  if (limpo === "") return null;

  const normalizado = separadorDecimalVirgula
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo.replace(/,/g, "");

  const numero = Number(normalizado);
  if (Number.isNaN(numero)) return null;

  return Math.round(numero * 100);
}

function extrairValorCentavos(
  campos: Record<string, string>,
  template: ImportTemplate,
): number | null {
  const { valor } = template;

  if (valor.modo === "unica") {
    const centavos = parseValorCentavos(
      campos[valor.coluna] ?? "",
      template.separadorDecimalVirgula,
    );
    if (centavos === null) return null;
    return valor.despesaPositiva ? centavos : -centavos;
  }

  if (valor.modo === "creditoDebito") {
    const credito = campos[valor.colunaCredito]?.trim() ?? "";
    const debito = campos[valor.colunaDebito]?.trim() ?? "";
    if (debito !== "") {
      const centavos = parseValorCentavos(
        debito,
        template.separadorDecimalVirgula,
      );
      return centavos === null ? null : Math.abs(centavos);
    }
    if (credito !== "") {
      const centavos = parseValorCentavos(
        credito,
        template.separadorDecimalVirgula,
      );
      return centavos === null ? null : -Math.abs(centavos);
    }
    return null;
  }

  // modo === "comIndicador"
  const centavos = parseValorCentavos(
    campos[valor.colunaValor] ?? "",
    template.separadorDecimalVirgula,
  );
  if (centavos === null) return null;
  const indicador = (campos[valor.colunaIndicador] ?? "").trim();
  const ehDespesa = valor.indicadoresDespesa.some(
    (i) => i.toLowerCase() === indicador.toLowerCase(),
  );
  return ehDespesa ? Math.abs(centavos) : -Math.abs(centavos);
}

// Faz o parsing de um CSV bruto de acordo com o template selecionado.
// Linhas com data/valor inválidos ou vazias são reportadas em `erros` em vez
// de interromper a importação inteira.
export function parseImportacao(
  csvTexto: string,
  template: ImportTemplate,
): ResultadoParse {
  const linhasCsv = parseCsv(csvTexto, template.delimitador);
  const objetos = linhasParaObjetos(linhasCsv);

  const linhas: LinhaImportada[] = [];
  const erros: ErroImportacao[] = [];

  objetos.forEach((campos, indice) => {
    const numeroLinha = indice + 2; // +1 cabeçalho, +1 índice base 1
    const descricaoOrigem = (campos[template.colunaDescricao] ?? "").trim();
    const dataRaw = campos[template.colunaData] ?? "";

    const data = parseData(dataRaw, template.formatoData);
    if (!data) {
      erros.push({ numeroLinha, motivo: `Data inválida: "${dataRaw}"` });
      return;
    }

    const valorCentavos = extrairValorCentavos(campos, template);
    if (valorCentavos === null) {
      erros.push({ numeroLinha, motivo: "Valor inválido ou ausente." });
      return;
    }

    if (!descricaoOrigem) {
      erros.push({ numeroLinha, motivo: "Descrição vazia." });
      return;
    }

    linhas.push({ numeroLinha, data, descricaoOrigem, valorCentavos });
  });

  return { linhas, erros };
}
