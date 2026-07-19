import type { PrismaClient } from "@/generated/prisma/client";
import { valorLiquidoCentavos } from "./lancamentos";
import { dividirPorPeso } from "./split";

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

// Quanto um pagador pagou "em nome de" outra pessoa INDIVIDUAL, por mês.
// Além dos lançamentos cuja divisão é a própria pessoa, inclui a fatia dela
// nos gastos de grupos (CASAL/FAMÍLIA) de que participa, rateada pelo peso de
// cada integrante — a mesma regra do acerto de contas em split.ts.
export type LinhaPagouPor = {
  // pessoa INDIVIDUAL beneficiada
  pessoaId: string;
  pagadorId: string;
  porMes: Record<string, number>;
};

export type ControlePagamento = {
  // "AAAA-MM" em ordem crescente, cobrindo o período consultado
  meses: string[];
  pessoasDivisao: PessoaResumo[];
  pagadores: PessoaResumo[];
  linhas: LinhaControlePagamento[];
  pagouPor: LinhaPagouPor[];
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
  opts: { dataInicio?: Date; dataFim?: Date } = {},
): Promise<ControlePagamento> {
  const [pessoas, individuais, grupos, lancamentos, repasses] = await Promise.all([
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
    prisma.pessoa.findMany({
      where: { householdId, tipo: { in: ["CASAL", "FAMILIA"] } },
      select: {
        id: true,
        integrantesDoGrupo: { select: { pessoaId: true, peso: true } },
      },
    }),
    prisma.lancamento.findMany({
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
        data: true,
        valorCentavos: true,
        descontoCentavos: true,
        pessoaDivisaoId: true,
        pessoaPagouId: true,
        pessoaDivisao: { select: { tipo: true } },
      },
    }),
    prisma.acertoContas.findMany({
      where: {
        householdId,
        ...(opts.dataInicio || opts.dataFim
          ? {
            dataInicio: {
              ...(opts.dataInicio ? { gte: opts.dataInicio } : {}),
              ...(opts.dataFim ? { lte: opts.dataFim } : {}),
            },
          }
          : {}),
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

  // Matriz "quanto A pagou pela B" (B sempre INDIVIDUAL): mesma regra de
  // rateio do acerto de contas em split.ts — gasto de grupo é dividido pelo
  // peso dos integrantes, e só a fatia de quem NÃO pagou conta como "pago
  // pela outra pessoa". Divisão OUTRO e grupo sem integrantes ficam de fora.
  const integrantesPorGrupo = new Map(
    grupos.map((g) => [g.id, g.integrantesDoGrupo]),
  );
  const somaPagouPor = new Map<string, Map<string, number>>();
  function somarPagouPor(
    pessoaId: string,
    pagadorId: string,
    mes: string,
    valor: number,
  ) {
    if (valor === 0) return;
    const chave = `${pessoaId}::${pagadorId}`;
    if (!somaPagouPor.has(chave)) somaPagouPor.set(chave, new Map());
    const porMes = somaPagouPor.get(chave)!;
    porMes.set(mes, (porMes.get(mes) ?? 0) + valor);
  }

  for (const l of lancamentos) {
    somar(l.pessoaDivisaoId, l.pessoaPagouId, mesDe(l.data), valorLiquidoCentavos(l));

    const tipo = l.pessoaDivisao.tipo;
    const valorLiquido = valorLiquidoCentavos(l);
    if (tipo === "INDIVIDUAL") {
      if (l.pessoaDivisaoId !== l.pessoaPagouId) {
        somarPagouPor(l.pessoaDivisaoId, l.pessoaPagouId, mesDe(l.data), valorLiquido);
      }
    } else if (tipo === "CASAL" || tipo === "FAMILIA") {
      const integrantes = integrantesPorGrupo.get(l.pessoaDivisaoId) ?? [];
      if (integrantes.length > 0) {
        const partes = dividirPorPeso(
          valorLiquido,
          integrantes.map((i) => i.peso),
        );
        integrantes.forEach((integrante, idx) => {
          if (integrante.pessoaId === l.pessoaPagouId) return;
          somarPagouPor(integrante.pessoaId, l.pessoaPagouId, mesDe(l.data), partes[idx]);
        });
      }
    }
  }
  for (const r of repasses) {
    somar(r.paraId, r.deId, mesDe(r.dataInicio), r.valorCentavos);
    somarPagouPor(r.paraId, r.deId, mesDe(r.dataInicio), r.valorCentavos);
  }

  // Sem dataInicio/dataFim explícitos: acumulado de tudo — o intervalo de
  // meses exibido cobre do lançamento/repasse mais antigo ao mais recente
  // (mês atual, se não houver nenhum registro ainda).
  const todasAsDatas = [
    ...lancamentos.map((l) => l.data),
    ...repasses.map((r) => r.dataInicio),
  ];
  const dataMin =
    opts.dataInicio ??
    (todasAsDatas.length > 0
      ? new Date(Math.min(...todasAsDatas.map((d) => d.getTime())))
      : new Date());
  const dataMax =
    opts.dataFim ??
    (todasAsDatas.length > 0
      ? new Date(Math.max(...todasAsDatas.map((d) => d.getTime())))
      : new Date());

  const meses = mesesEntre(dataMin, dataMax);
  const linhas: LinhaControlePagamento[] = [];
  for (const divisao of pessoas) {
    for (const pagador of individuais) {
      const porMesSomado = somaPorLinha.get(`${divisao.id}::${pagador.id}`);
      const porMes: Record<string, number> = {};
      for (const mes of meses) porMes[mes] = porMesSomado?.get(mes) ?? 0;
      linhas.push({ divisaoId: divisao.id, pagadorId: pagador.id, porMes });
    }
  }

  const pagouPor: LinhaPagouPor[] = [];
  for (const pessoa of individuais) {
    for (const pagador of individuais) {
      if (pessoa.id === pagador.id) continue;
      const porMesSomado = somaPagouPor.get(`${pessoa.id}::${pagador.id}`);
      const porMes: Record<string, number> = {};
      for (const mes of meses) porMes[mes] = porMesSomado?.get(mes) ?? 0;
      pagouPor.push({ pessoaId: pessoa.id, pagadorId: pagador.id, porMes });
    }
  }

  return { meses, pessoasDivisao: pessoas, pagadores: individuais, linhas, pagouPor };
}
