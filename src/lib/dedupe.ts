/**
 * Remove entradas com chave repetida, mantendo a primeira ocorrência.
 * Usado antes de renderizar listas vindas de fetch como chave de React,
 * já que duplicatas nesses arrays quebram a unicidade exigida pelo `key`.
 */
export function unicosPorChave<T>(itens: T[], chave: (item: T) => string): T[] {
  const vistos = new Set<string>();
  return itens.filter((item) => {
    const k = chave(item);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

export function unicosPorId<T extends { id: string }>(itens: T[]): T[] {
  return unicosPorChave(itens, (item) => item.id);
}
