import type { PrismaClient } from "@/generated/prisma/client";
import { valorLiquidoCentavos } from "./lancamentos";

// ─── RF11: Acerto de contas entre as pessoas da casa ───────────────────────────
//
// Cada Lançamento tem uma pessoa "dona" do gasto (pessoaDivisao) e uma pessoa
// que efetivamente pagou (pessoaPagou). Quando a dona do gasto é uma pessoa do
// tipo INDIVIDUAL diferente de quem pagou, quem pagou pagou 100% em nome dela.
// Quando a divisão é CASAL ou FAMÍLIA (gasto compartilhado pela casa), quem
// pagou só pagou "pelos outros" a fração que caberia a cada um dos demais
// participantes — dividida igualmente entre todas as pessoas do tipo
// INDIVIDUAL cadastradas, não apenas duas. Isso vale tanto para uma pessoa que
// mora sozinha (nada a acertar) quanto para um casal, uma família com vários
// membros ou um grupo de amigos dividindo a casa. Divisão do tipo OUTRO
// (terceiro, ex. um convidado) não entra no acerto de contas.

export type TipoPessoaDivisao = "INDIVIDUAL" | "CASAL" | "FAMILIA" | "OUTRO";

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

/**
 * Divide um valor em N partes inteiras (centavos) que somam exatamente o
 * total, distribuindo o resto de centavos entre as primeiras partes.
 */
function dividirIgualmente(valorCentavos: number, partes: number): number[] {
  const base = Math.floor(valorCentavos / partes);
  const resto = valorCentavos - base * partes;
  return Array.from({ length: partes }, (_, i) => base + (i < resto ? 1 : 0));
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
): SaldoDivisaoGrupo {
  const participantes = new Set(participanteIds);
  const saldo = new Map<string, number>(participanteIds.map((id) => [id, 0]));

  for (const lancamento of lancamentos) {
    const pagador = lancamento.pessoaPagouId;
    if (!participantes.has(pagador)) continue;
    if (lancamento.pessoaDivisaoTipo === "OUTRO") continue;

    const valorLiquido = valorLiquidoCentavos(lancamento);

    if (lancamento.pessoaDivisaoTipo === "INDIVIDUAL") {
      const dono = lancamento.pessoaDivisaoId;
      if (dono === pagador) continue; // pagou o próprio gasto, sem acerto
      if (!participantes.has(dono)) continue;
      saldo.set(pagador, (saldo.get(pagador) ?? 0) + valorLiquido);
      saldo.set(dono, (saldo.get(dono) ?? 0) - valorLiquido);
      continue;
    }

    // CASAL ou FAMÍLIA: gasto compartilhado pela casa, dividido igualmente
    // entre todos os participantes. Quem pagou só pagou "pelos outros" a
    // fração que coube a cada um deles (a própria fração não gera débito).
    if (participanteIds.length === 0) continue;
    const partes = dividirIgualmente(valorLiquido, participanteIds.length);
    participanteIds.forEach((pessoaId, idx) => {
      if (pessoaId === pagador) return;
      const parte = partes[idx];
      saldo.set(pagador, (saldo.get(pagador) ?? 0) + parte);
      saldo.set(pessoaId, (saldo.get(pessoaId) ?? 0) - parte);
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

export async function buscarSaldoDivisaoGrupo(
  prisma: PrismaClient,
  householdId: string,
  opts: {
    dataInicio?: Date;
    dataFim?: Date;
  } = {},
): Promise<SaldoDivisaoGrupo | null> {
  const individuais = await prisma.pessoa.findMany({
    where: { householdId, tipo: "INDIVIDUAL" },
    orderBy: { nome: "asc" },
    select: { id: true },
  });
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
    select: {
      valorCentavos: true,
      descontoCentavos: true,
      pessoaDivisaoId: true,
      pessoaPagouId: true,
      pessoaDivisao: { select: { tipo: true } },
    },
  });

  return calcularSaldoDivisaoGrupo(
    lancamentos.map((l) => ({
      valorCentavos: l.valorCentavos,
      descontoCentavos: l.descontoCentavos,
      pessoaDivisaoId: l.pessoaDivisaoId,
      pessoaDivisaoTipo: l.pessoaDivisao.tipo,
      pessoaPagouId: l.pessoaPagouId,
    })),
    individuais.map((p) => p.id),
  );
}
