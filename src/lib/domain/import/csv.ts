// Parser CSV simples (RFC4180): suporta campos entre aspas, aspas escapadas
// (""), delimitador configurável e quebras de linha dentro de campos citados.
export function parseCsv(texto: string, delimitador = ","): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroDeAspas = false;

  // Normaliza quebras de linha e remove BOM eventual do início do arquivo.
  const conteudo = texto.replace(/^﻿/, "").replace(/\r\n/g, "\n");

  for (let i = 0; i < conteudo.length; i++) {
    const char = conteudo[i];

    if (dentroDeAspas) {
      if (char === '"') {
        if (conteudo[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += char;
      }
      continue;
    }

    if (char === '"') {
      dentroDeAspas = true;
    } else if (char === delimitador) {
      linha.push(campo);
      campo = "";
    } else if (char === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += char;
    }
  }

  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas.filter((l) => !(l.length === 1 && l[0].trim() === ""));
}

// Converte linhas de CSV (com cabeçalho na primeira linha) em objetos
// indexados pelo nome da coluna, aparados de espaços.
export function linhasParaObjetos(
  linhas: string[][],
): Record<string, string>[] {
  if (linhas.length === 0) return [];
  const cabecalho = linhas[0].map((c) => c.trim());
  return linhas.slice(1).map((linha) => {
    const obj: Record<string, string> = {};
    cabecalho.forEach((coluna, i) => {
      obj[coluna] = (linha[i] ?? "").trim();
    });
    return obj;
  });
}
