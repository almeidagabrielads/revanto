const PALETA = [
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-container text-on-tertiary-container",
  "bg-success/15 text-success",
  "bg-danger-container text-on-danger-container",
] as const;

// Mesma ordem de PALETA, em cores CSS utilizáveis em SVG (fill/stroke).
const PALETA_COR_SVG = [
  "var(--color-secondary-container)",
  "var(--color-tertiary-container)",
  "var(--color-success)",
  "var(--color-danger-container)",
] as const;

const COMPARTILHADO = "bg-primary-container text-on-primary-container";

function hashSimples(texto: string): number {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    hash = (hash * 31 + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Cor determinística por pessoa (via hash do id), para funcionar com
 * qualquer número de pessoas cadastradas — não apenas duas fixas.
 */
export function corPessoa(pessoaId: string, compartilhado = false): string {
  if (compartilhado) return COMPARTILHADO;
  return PALETA[hashSimples(pessoaId) % PALETA.length];
}

/** Mesma cor de corPessoa(), como valor CSS (para uso em SVG). */
export function corPessoaSvg(pessoaId: string): string {
  return PALETA_COR_SVG[hashSimples(pessoaId) % PALETA_COR_SVG.length];
}

export function PessoaBadge({
  nome,
  pessoaId,
  compartilhado = false,
}: {
  nome: string;
  pessoaId: string;
  compartilhado?: boolean;
}) {
  return (
    <span
      className={`px-sm inline-flex items-center rounded-full py-0.5 text-xs font-semibold ${corPessoa(pessoaId, compartilhado)}`}
    >
      {nome}
    </span>
  );
}
