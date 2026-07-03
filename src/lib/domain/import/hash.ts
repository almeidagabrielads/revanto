import { createHash } from "node:crypto";

// Hash determinístico usado para detectar lançamentos já importados
// anteriormente (RF06): mesma data + descrição + valor + banco.
export function calcularHashImportacao(dados: {
  data: Date;
  descricaoOrigem: string;
  valorCentavos: number;
  bancoId: string;
}): string {
  const dataIso = dados.data.toISOString().slice(0, 10);
  const descricaoNormalizada = dados.descricaoOrigem
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  const chave = [
    dataIso,
    descricaoNormalizada,
    dados.valorCentavos,
    dados.bancoId,
  ].join("|");

  return createHash("sha256").update(chave).digest("hex");
}
