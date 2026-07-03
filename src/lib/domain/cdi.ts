import type { PrismaClient } from "@/generated/prisma/client";

// ─── RF14: fonte do CDI — API do Banco Central (SGS série 4391) ───────────────
//
// Série 4391 = "Taxa de juros - CDI acumulada no mês" (% ao mês), já no
// formato que a planilha original usava na linha "CDI mensal". Ver ponto em
// aberto original em docs/REQUISITOS.md §5 (decidido: integração externa, não
// input manual).

const BCB_SGS_CDI_MENSAL_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados";

export type CdiMensalBCB = {
  mes: Date;
  percentual: number;
};

type RespostaSerieBCB = { data: string; valor: string }[];

function formatarDataBCB(data: Date): string {
  const dd = String(data.getUTCDate()).padStart(2, "0");
  const mm = String(data.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = data.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function primeiroDiaDoMesUTC(mesAno: string): Date {
  // formato retornado pela API: "DD/MM/YYYY"
  const [, mm, yyyy] = mesAno.split("/");
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, 1));
}

export async function buscarCdiMensalBCB(
  dataInicial: Date,
  dataFinal: Date,
): Promise<CdiMensalBCB[]> {
  const url = new URL(BCB_SGS_CDI_MENSAL_URL);
  url.searchParams.set("formato", "json");
  url.searchParams.set("dataInicial", formatarDataBCB(dataInicial));
  url.searchParams.set("dataFinal", formatarDataBCB(dataFinal));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(
      `Falha ao buscar CDI na API do BCB (status ${response.status}).`,
    );
  }

  const dados = (await response.json()) as RespostaSerieBCB;
  return dados.map(({ data, valor }) => ({
    mes: primeiroDiaDoMesUTC(data),
    percentual: Number(valor),
  }));
}

function chaveMes(mes: Date): string {
  return `${mes.getUTCFullYear()}-${mes.getUTCMonth()}`;
}

function mesesEntre(dataInicial: Date, dataFinal: Date): Date[] {
  const meses: Date[] = [];
  let atual = new Date(
    Date.UTC(dataInicial.getUTCFullYear(), dataInicial.getUTCMonth(), 1),
  );
  const fim = new Date(
    Date.UTC(dataFinal.getUTCFullYear(), dataFinal.getUTCMonth(), 1),
  );
  while (atual.getTime() <= fim.getTime()) {
    meses.push(atual);
    atual = new Date(
      Date.UTC(atual.getUTCFullYear(), atual.getUTCMonth() + 1, 1),
    );
  }
  return meses;
}

/**
 * Retorna o CDI mensal (% ao mês) para o período pedido, usando o cache local
 * (tabela CdiMensal) e só chamando a API do BCB para os meses que faltam.
 */
export async function obterCdiMensal(
  prisma: PrismaClient,
  dataInicial: Date,
  dataFinal: Date,
) {
  const cache = await prisma.cdiMensal.findMany({
    where: { mes: { gte: dataInicial, lte: dataFinal } },
    orderBy: { mes: "asc" },
  });

  const mesesCache = new Set(cache.map((c) => chaveMes(c.mes)));
  const mesesFaltantes = mesesEntre(dataInicial, dataFinal).filter(
    (mes) => !mesesCache.has(chaveMes(mes)),
  );

  if (mesesFaltantes.length === 0) {
    return cache;
  }

  const buscados = await buscarCdiMensalBCB(dataInicial, dataFinal);
  if (buscados.length > 0) {
    await prisma.cdiMensal.createMany({
      data: buscados.map((b) => ({ mes: b.mes, percentual: b.percentual })),
      skipDuplicates: true,
    });
  }

  return prisma.cdiMensal.findMany({
    where: { mes: { gte: dataInicial, lte: dataFinal } },
    orderBy: { mes: "asc" },
  });
}
