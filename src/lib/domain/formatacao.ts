// Centaliza conversões entre centavos (armazenamento) e reais (exibição/input).
// Valores monetários nunca usam float no banco — só aqui, na borda de UI.

export function centavosParaReais(valorCentavos: number): string {
  return (valorCentavos / 100).toFixed(2);
}

export function reaisParaCentavos(valor: string): number {
  if (valor.trim() === "") return 0;
  const n = Number(valor.replace(",", "."));
  return Math.round(n * 100);
}

export function formatarMoeda(valorCentavos: number): string {
  return Math.abs(valorCentavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
