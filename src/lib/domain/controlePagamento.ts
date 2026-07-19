import type { PrismaClient } from "@/generated/prisma/client";
import { valorLiquidoCentavos } from "./lancamentos";

// ─── RF: Controle de pagamento ─────────────────────────────────────────────
//
// Matriz "divisão × quem pagou" com o total pago em cada mês do período,
// somando tanto Lançamentos quanto Repasses (AcertoContas — ver acertos.ts).
// Um repasse (ex.: Pix de quem devia para quem tinha a receber) é tratado
// como um pagamento cuja "divisão" é o destinatário (paraId) e cujo pagador
// é o remetente (deId): fisicamente, deId está quitando um valor que estava
// atribuído a paraId, o mesmo efeito líquido de deId ter pago uma despesa de
// paraId (ver aplicarAcertosResolvidos em split.ts, que usa a mesma
// convenção de sinais).

export type PessoaResumo = { id: string; nome: string };

export type LinhaControlePagamento = {
  divisaoId: string;
  pagadorId: string;
  // "AAAA-MM" -> soma em centavos naquele mês
  porMes: Record<string, number>;
};

export type ControlePagamento = {
  // "AAAA-MM" em ordem crescente, cobrindo o período consultado
  meses: string[];
  pessoasDivisao: PessoaResumo[];
  pagadores: PessoaResumo[];
  linhas: LinhaControlePagamento[];
};

function mesDe(data: Date): string {
  return data.toISOString().slice(0, 7);
}

function mesesEntre(inicio: Date, fim: Date): string[] {
  const meses: string[] = [];
  const cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
  const limite = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));
  while (cursor <= limite) {
    meses.push(mesDe(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return meses;
}

export async function buscarControlePagamento(
  prisma: PrismaClient,
  householdId: string,
  opts: { dataInicio: Date; dataFim: Date },
): Promise<ControlePagamento> {
  const [pessoas, individuais, lancamentos, repasses] = await Promise.all([
    prisma.pessoa.findMany({
      where: { householdId },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.pessoa.findMany({
      where: { householdId, tipo: "INDIVIDUAL" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.lancamento.findMany({
      where: {
        householdId,
        data: { gte: opts.dataInicio, lte: opts.dataFim },
      },
      select: {
        data: true,
        valorCentavos: true,
        descontoCentavos: true,
        pessoaDivisaoId: true,
        pessoaPagouId: true,
      },
    }),
    prisma.acertoContas.findMany({
      where: {
        householdId,
        dataInicio: { gte: opts.dataInicio, lte: opts.dataFim },
      },
      select: { dataInicio: true, valorCentavos: true, deId: true, paraId: true },
    }),
  ]);

  const somaPorLinha = new Map<string, Map<string, number>>();
  function somar(divisaoId: string, pagadorId: string, mes: string, valor: number) {
    const chave = `${divisaoId}::${pagadorId}`;
    if (!somaPorLinha.has(chave)) somaPorLinha.set(chave, new Map());
    const porMes = somaPorLinha.get(chave)!;
    porMes.set(mes, (porMes.get(mes) ?? 0) + valor);
  }

  for (const l of lancamentos) {
    somar(l.pessoaDivisaoId, l.pessoaPagouId, mesDe(l.data), valorLiquidoCentavos(l));
  }
  for (const r of repasses) {
    somar(r.paraId, r.deId, mesDe(r.dataInicio), r.valorCentavos);
  }

  const meses = mesesEntre(opts.dataInicio, opts.dataFim);
  const linhas: LinhaControlePagamento[] = [];
  for (const divisao of pessoas) {
    for (const pagador of individuais) {
      const porMesSomado = somaPorLinha.get(`${divisao.id}::${pagador.id}`);
      const porMes: Record<string, number> = {};
      for (const mes of meses) porMes[mes] = porMesSomado?.get(mes) ?? 0;
      linhas.push({ divisaoId: divisao.id, pagadorId: pagador.id, porMes });
    }
  }

  return { meses, pessoasDivisao: pessoas, pagadores: individuais, linhas };
}
