// Extrai um número de um texto exibido na tela (ex.: "R$ 1.234,56", "-R$ 45,00")
// — usado pela calculadora lateral para permitir "selecionar" valores já
// mostrados na página (ver CalculadoraLateral.tsx). Aceita tanto o formato
// pt-BR completo (ponto = milhar, vírgula = decimal) quanto um único
// separador solto, já que o motor de formatação de moeda do navegador pode
// variar entre páginas conforme os dados de locale disponíveis.
export function extrairValorTela(texto: string): number | null {
  const limpo = texto.trim().replace(/[^\d.,-]/g, "");
  if (!limpo) return null;

  const negativo = limpo.startsWith("-");
  let corpo = limpo.replace(/^-/, "");
  if (!corpo) return null;

  const temVirgula = corpo.includes(",");
  const temPonto = corpo.includes(".");

  if (temVirgula && temPonto) {
    corpo = corpo.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    corpo = corpo.replace(",", ".");
  } else if (temPonto) {
    const partes = corpo.split(".");
    const ehDecimal = partes.length === 2 && partes[1].length === 2;
    if (!ehDecimal) corpo = corpo.replace(/\./g, "");
  }

  const numero = Number(corpo);
  if (!Number.isFinite(numero)) return null;
  return negativo ? -numero : numero;
}
