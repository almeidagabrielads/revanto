import type { PrismaClient } from "@/generated/prisma/client";
import { valorLiquidoCentavos } from "./lancamentos";

// ─── RF11: Acerto de contas entre as pessoas da casa ───────────────────────────
//
// Cada Lançamento tem uma pessoa "dona" do gasto (pessoaDivisao) e uma pessoa
// que efetivamente pagou (pessoaPagou). Quando a dona do gasto é uma pessoa do
// tipo INDIVIDUAL diferente de quem pagou, quem pagou pagou 100% em nome dela.
// Quando a divisão é CASAL ou FAMÍLIA (gasto compartilhado por um grupo), quem
// pagou só pagou "pelos outros" a fração que caberia a cada um dos demais
// integrantes DAQUELE grupo específico — dividida proporcionalmente ao peso de
// cada integrante (ver IntegranteGrupo no schema), não mais entre todas as
// pessoas INDIVIDUAL do household. Pesos iguais (padrão) resultam em partes
// iguais; pesos diferentes (ex.: 60/40) permitem um split customizado. Um
// grupo sem integrantes cadastrados não gera acerto para seus lançamentos
// (mesmo tratamento dado a OUTRO) — ver `gruposSemComposicao` no retorno de
// `buscarSaldoDivisaoGrupo` para sinalizar esse caso à UI. Divisão do tipo
// OUTRO (terceiro, ex. um convidado) nunca entra no acerto de contas.

export type TipoPessoaDivisao = "INDIVIDUAL" | "CASAL" | "FAMILIA" | "OUTRO";

export type ParticipanteDivisao = {
  pessoaId: string;
  // Peso relativo para divisão proporcional do gasto de um grupo específico
  // (ver IntegranteGrupo). Pesos iguais entre os integrantes de um mesmo
  // grupo equivalem a divisão igualitária.
  peso: number;
};

export type LancamentoParaDivisao = {
  valorCentavos: number;
  descontoCentavos: number;
  pessoaDivisaoId: string;
  pessoaDivisaoTipo: TipoPessoaDivisao;
  pessoaPagouId: string;
};

export type SaldoPessoa = {
  pessoaId: string;
  // positivo = a receber dos demais; negativo = deve aos demais
  saldoCentavos: number;
};

export type Transferencia = {
  deId: string;
  paraId: string;
  valorCentavos: number;
};

export type SaldoDivisaoGrupo = {
  // pessoas do tipo INDIVIDUAL consideradas no acerto, em ordem estável
  participantes: string[];
  saldosPorPessoa: SaldoPessoa[];
  // conjunto mínimo de transferências para zerar todos os saldos
  transferenciasSugeridas: Transferencia[];
};

export type TotalPagoPessoa = {
  pessoaId: string;
  totalCentavos: number;
};

export type LancamentoDetalheDivisao = {
  id: string;
  data: Date;
  descricao: string;
  categoriaNome: string | null;
  valorCentavos: number;
  pessoaDivisaoId: string;
};

export type InsightDivisao = {
  categoriaNome: string;
  pessoaId: string;
} | null;

// Grupo (CASAL/FAMILIA) que teve lançamentos no período mas não tem nenhum
// integrante cadastrado — esses lançamentos foram excluídos do acerto porque
// não há como saber entre quem dividir. Sinaliza isso à UI em vez de deixar o
// gasto "sumir" silenciosamente do cálculo.
export type GrupoSemComposicao = {
  pessoaId: string;
  nome: string;
};

// Versão enriquecida usada pela tela de divisão: além do saldo,
// traz o total pago por pessoa, o detalhamento dos lançamentos do período e
// um destaque (categoria com maior gasto + quem mais pagou nela).
export type ResumoDivisaoGrupo = SaldoDivisaoGrupo & {
  totalPagoPorPessoa: TotalPagoPessoa[];
  lancamentos: LancamentoDetalheDivisao[];
  insight: InsightDivisao;
  gruposSemComposicao: GrupoSemComposicao[];
};

/**
 * Divide um valor em partes inteiras (centavos) proporcionais aos pesos
 * informados, somando exatamente o total. Usa o método dos maiores restos:
 * cada parte recebe o piso da fração proporcional, e os centavos restantes
 * vão para as partes com maior resto fracionário (empate: primeiro índice).
 * Pesos iguais reproduzem uma divisão igualitária.
 */
export function dividirPorPeso(valorCentavos: number, pesos: number[]): number[] {
  const somaPesos = pesos.reduce((soma, peso) => soma + peso, 0);
  if (somaPesos <= 0) return pesos.map(() => 0);

  const brutos = pesos.map((peso) => (valorCentavos * peso) / somaPesos);
  const partes = brutos.map(Math.floor);
  const resto = valorCentavos - partes.reduce((soma, parte) => soma + parte, 0);

  const porMaiorResto = brutos
    .map((bruto, idx) => ({ idx, fracao: bruto - Math.floor(bruto) }))
    .sort((a, b) => b.fracao - a.fracao || a.idx - b.idx);

  for (let i = 0; i < resto; i++) {
    partes[porMaiorResto[i].idx] += 1;
  }

  return partes;
}

/**
 * Simplifica os saldos líquidos em um conjunto mínimo de transferências
 * (algoritmo guloso: sempre casa quem mais deve receber com quem mais deve
 * pagar). Não muta o array de entrada.
 */
function simplificarTransferencias(saldos: SaldoPessoa[]): Transferencia[] {
  const credores = saldos
    .filter((s) => s.saldoCentavos > 0)
    .map((s) => ({ ...s }))
    .sort(
      (a, b) =>
        b.saldoCentavos - a.saldoCentavos ||
        a.pessoaId.localeCompare(b.pessoaId),
    );
  const devedores = saldos
    .filter((s) => s.saldoCentavos < 0)
    .map((s) => ({ ...s }))
    .sort(
      (a, b) =>
        a.saldoCentavos - b.saldoCentavos ||
        a.pessoaId.localeCompare(b.pessoaId),
    );

  const transferencias: Transferencia[] = [];
  let i = 0;
  let j = 0;
  while (i < credores.length && j < devedores.length) {
    const credor = credores[i];
    const devedor = devedores[j];
    const valor = Math.min(credor.saldoCentavos, -devedor.saldoCentavos);

    if (valor > 0) {
      transferencias.push({
        deId: devedor.pessoaId,
        paraId: credor.pessoaId,
        valorCentavos: valor,
      });
      credor.saldoCentavos -= valor;
      devedor.saldoCentavos += valor;
    }

    if (credor.saldoCentavos === 0) i++;
    if (devedor.saldoCentavos === 0) j++;
  }

  return transferencias;
}

export function calcularSaldoDivisaoGrupo(
  lancamentos: LancamentoParaDivisao[],
  participanteIds: string[],
  integrantesPorGrupo: Map<string, ParticipanteDivisao[]> = new Map(),
): SaldoDivisaoGrupo {
  const participantes = new Set(participanteIds);
  const saldo = new Map<string, number>(participanteIds.map((id) => [id, 0]));

  for (const lancamento of lancamentos) {
    const pagador = lancamento.pessoaPagouId;
    if (!participantes.has(pagador)) continue;
    if (lancamento.pessoaDivisaoTipo === "OUTRO") continue;

    const valorLiquido = valorLiquidoCentavos(lancamento);

    if (lancamento.pessoaDivisaoTipo === "INDIVIDUAL") {
      const divisao = lancamento.pessoaDivisaoId;
      if (divisao === pagador) continue; // pagou o próprio gasto, sem acerto
      if (!participantes.has(divisao)) continue;
      saldo.set(pagador, (saldo.get(pagador) ?? 0) + valorLiquido);
      saldo.set(divisao, (saldo.get(divisao) ?? 0) - valorLiquido);
      continue;
    }

    // CASAL ou FAMÍLIA: gasto compartilhado por um grupo específico, dividido
    // proporcionalmente ao peso de cada integrante DAQUELE grupo. Um grupo
    // sem integrantes cadastrados não entra no acerto (mesmo tratamento de
    // OUTRO) — ver `gruposSemComposicao` em buscarSaldoDivisaoGrupo. Quem
    // pagou só pagou "pelos outros" a fração que coube a cada integrante (a
    // própria fração, se ele for integrante, não gera débito); se quem pagou
    // não for integrante do grupo, é reembolsado por 100% do valor.
    const integrantes = integrantesPorGrupo.get(lancamento.pessoaDivisaoId);
    if (!integrantes || integrantes.length === 0) continue;

    const integrantesNoAcerto = integrantes.filter((i) =>
      participantes.has(i.pessoaId),
    );
    if (integrantesNoAcerto.length === 0) continue;

    const pesos = integrantesNoAcerto.map((i) => i.peso);
    const partes = dividirPorPeso(valorLiquido, pesos);
    integrantesNoAcerto.forEach((integrante, idx) => {
      if (integrante.pessoaId === pagador) return;
      const parte = partes[idx];
      saldo.set(pagador, (saldo.get(pagador) ?? 0) + parte);
      saldo.set(
        integrante.pessoaId,
        (saldo.get(integrante.pessoaId) ?? 0) - parte,
      );
    });
  }

  const saldosPorPessoa: SaldoPessoa[] = participanteIds.map((pessoaId) => ({
    pessoaId,
    saldoCentavos: saldo.get(pessoaId) ?? 0,
  }));

  return {
    participantes: participanteIds,
    saldosPorPessoa,
    transferenciasSugeridas: simplificarTransferencias(saldosPorPessoa),
  };
}

export type AcertoResolvido = {
  deId: string;
  paraId: string;
  valorCentavos: number;
};

/**
 * Desconta do saldo bruto (calculado a partir dos lançamentos) os acertos já
 * resolvidos — pagamentos que já aconteceram de fato — chegando ao saldo
 * líquido realmente pendente. Quem pagou (deId) tem sua dívida reduzida;
 * quem recebeu (paraId) tem seu crédito reduzido.
 */
export function aplicarAcertosResolvidos(
  saldo: SaldoDivisaoGrupo,
  acertosResolvidos: AcertoResolvido[],
): SaldoDivisaoGrupo {
  if (acertosResolvidos.length === 0) return saldo;

  const saldoAjustado = new Map(
    saldo.saldosPorPessoa.map((s) => [s.pessoaId, s.saldoCentavos]),
  );
  for (const a of acertosResolvidos) {
    saldoAjustado.set(
      a.deId,
      (saldoAjustado.get(a.deId) ?? 0) + a.valorCentavos,
    );
    saldoAjustado.set(
      a.paraId,
      (saldoAjustado.get(a.paraId) ?? 0) - a.valorCentavos,
    );
  }

  const saldosPorPessoa: SaldoPessoa[] = saldo.participantes.map(
    (pessoaId) => ({
      pessoaId,
      saldoCentavos: saldoAjustado.get(pessoaId) ?? 0,
    }),
  );

  return {
    participantes: saldo.participantes,
    saldosPorPessoa,
    transferenciasSugeridas: simplificarTransferencias(saldosPorPessoa),
  };
}

export async function buscarSaldoDivisaoGrupo(
  prisma: PrismaClient,
  householdId: string,
  opts: {
    dataInicio?: Date;
    dataFim?: Date;
  } = {},
): Promise<ResumoDivisaoGrupo | null> {
  const [individuais, grupos] = await Promise.all([
    prisma.pessoa.findMany({
      where: { householdId, tipo: "INDIVIDUAL" },
      orderBy: { nome: "asc" },
      select: { id: true },
    }),
    prisma.pessoa.findMany({
      where: { householdId, tipo: { in: ["CASAL", "FAMILIA"] } },
      select: {
        id: true,
        nome: true,
        integrantesDoGrupo: { select: { pessoaId: true, peso: true } },
      },
    }),
  ]);
  if (individuais.length < 2) return null;

  const lancamentos = await prisma.lancamento.findMany({
    where: {
      householdId,
      ...(opts.dataInicio || opts.dataFim
        ? {
          data: {
            ...(opts.dataInicio ? { gte: opts.dataInicio } : {}),
            ...(opts.dataFim ? { lte: opts.dataFim } : {}),
          },
        }
        : {}),
    },
    orderBy: { data: "desc" },
    select: {
      id: true,
      data: true,
      descricaoOrigem: true,
      descricaoPropria: true,
      valorCentavos: true,
      descontoCentavos: true,
      pessoaDivisaoId: true,
      pessoaPagouId: true,
      pessoaDivisao: { select: { tipo: true } },
      categoria: { select: { nome: true } },
    },
  });

  const participanteIds = individuais.map((p) => p.id);
  const integrantesPorGrupo = new Map<string, ParticipanteDivisao[]>(
    grupos.map((g) => [
      g.id,
      g.integrantesDoGrupo.map((i) => ({ pessoaId: i.pessoaId, peso: i.peso })),
    ]),
  );
  const lancamentosParaDivisao = lancamentos.map((l) => ({
    valorCentavos: l.valorCentavos,
    descontoCentavos: l.descontoCentavos,
    pessoaDivisaoId: l.pessoaDivisaoId,
    pessoaDivisaoTipo: l.pessoaDivisao.tipo,
    pessoaPagouId: l.pessoaPagouId,
  }));

  const saldoBruto = calcularSaldoDivisaoGrupo(
    lancamentosParaDivisao,
    participanteIds,
    integrantesPorGrupo,
  );

  // Desconta acertos já resolvidos (pagamentos que já aconteceram de fato)
  // cujo período consultado no momento da resolução esteja contido no
  // período agora consultado — sem isso, uma dívida já paga volta a aparecer
  // sempre que o período for recalculado (ex.: visão "acumulado até hoje").
  const acertosResolvidos = await prisma.acertoContas.findMany({
    where: {
      householdId,
      ...(opts.dataInicio ? { dataInicio: { gte: opts.dataInicio } } : {}),
      ...(opts.dataFim ? { dataFim: { lte: opts.dataFim } } : {}),
    },
    select: { deId: true, paraId: true, valorCentavos: true },
  });
  const saldo = aplicarAcertosResolvidos(saldoBruto, acertosResolvidos);

  const gruposComLancamento = new Set(
    lancamentosParaDivisao
      .filter(
        (l) =>
          l.pessoaDivisaoTipo === "CASAL" || l.pessoaDivisaoTipo === "FAMILIA",
      )
      .map((l) => l.pessoaDivisaoId),
  );
  const gruposSemComposicao: GrupoSemComposicao[] = grupos
    .filter((g) => gruposComLancamento.has(g.id) && g.integrantesDoGrupo.length === 0)
    .map((g) => ({ pessoaId: g.id, nome: g.nome }));

  const totalPagoPorPessoa: TotalPagoPessoa[] = participanteIds.map(
    (pessoaId) => ({
      pessoaId,
      totalCentavos: lancamentosParaDivisao
        .filter((l) => l.pessoaPagouId === pessoaId)
        .reduce((total, l) => total + valorLiquidoCentavos(l), 0),
    }),
  );

  const lancamentosDetalhados: LancamentoDetalheDivisao[] = lancamentos.map(
    (l) => ({
      id: l.id,
      data: l.data,
      descricao: l.descricaoPropria ?? l.descricaoOrigem ?? "",
      categoriaNome: l.categoria?.nome ?? null,
      valorCentavos: valorLiquidoCentavos(l),
      pessoaDivisaoId: l.pessoaDivisaoId,
    }),
  );

  return {
    ...saldo,
    totalPagoPorPessoa,
    lancamentos: lancamentosDetalhados,
    insight: calcularInsightDivisao(lancamentos),
    gruposSemComposicao,
  };
}

function calcularInsightDivisao(
  lancamentos: {
    categoria: { nome: string } | null;
    valorCentavos: number;
    descontoCentavos: number;
    pessoaPagouId: string;
  }[],
): InsightDivisao {
  const totalPorCategoria = new Map<string, number>();
  for (const l of lancamentos) {
    if (!l.categoria) continue;
    const atual = totalPorCategoria.get(l.categoria.nome) ?? 0;
    totalPorCategoria.set(l.categoria.nome, atual + valorLiquidoCentavos(l));
  }
  if (totalPorCategoria.size === 0) return null;

  const [categoriaNome] = [...totalPorCategoria.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

  const totalPorPessoaNaCategoria = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.categoria?.nome !== categoriaNome) continue;
    const atual = totalPorPessoaNaCategoria.get(l.pessoaPagouId) ?? 0;
    totalPorPessoaNaCategoria.set(
      l.pessoaPagouId,
      atual + valorLiquidoCentavos(l),
    );
  }
  const [pessoaId] = [...totalPorPessoaNaCategoria.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

  return { categoriaNome, pessoaId };
}
