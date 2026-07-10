import { config } from "dotenv";
config({ path: ".env.local", override: true });
config({ path: ".env" });

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type SubtipoReceita,
} from "../src/generated/prisma/client";

const APPLY = process.argv.includes("--apply");
const HOUSEHOLD_NOME =
  process.argv
    .find((arg) => arg.startsWith("--household="))
    ?.slice("--household=".length) ?? "Isa & Gabi";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type ReceitaSeed = {
  pessoa: "Gabi" | "Isa";
  subtipo: SubtipoReceita;
  descricao: string | null;
  valoresReal: number[];
};

const receitas: ReceitaSeed[] = [
  {
    pessoa: "Gabi",
    subtipo: "SALARIO",
    descricao: null,
    valoresReal: [49131.62, 46397.55, 42159.71, 32028.89, 9357.38, 13205.41, 9617.38],
  },
  {
    pessoa: "Isa",
    subtipo: "SALARIO",
    descricao: null,
    valoresReal: [6969.38, 7036.86, 7984.07, 11502.29, 6958.68, 8189.02, 7052.25],
  },
  {
    pessoa: "Isa",
    subtipo: "OUTROS",
    descricao: "Jader",
    valoresReal: [300, 300, 300, 0, 0, 0, 0],
  },
  {
    pessoa: "Gabi",
    subtipo: "VOUCHER",
    descricao: null,
    valoresReal: [701, 589, 682, 620, 620, 651, 713],
  },
  {
    pessoa: "Isa",
    subtipo: "VOUCHER",
    descricao: null,
    valoresReal: [924, 968, 968, 968, 968, 968, 968],
  },
];

function centavos(valor: number): number {
  return Math.round(valor * 100);
}

function mes2026(mes: number): Date {
  return new Date(Date.UTC(2026, mes - 1, 1));
}

async function main() {
  const household = await prisma.household.findUnique({
    where: { nome: HOUSEHOLD_NOME },
  });
  if (!household) throw new Error(`Household não encontrado: ${HOUSEHOLD_NOME}`);

  const pessoas = await prisma.pessoa.findMany({
    where: {
      householdId: household.id,
      nome: { in: ["Gabi", "Isa"] },
    },
    select: { id: true, nome: true },
  });
  const pessoaPorNome = new Map(pessoas.map((p) => [p.nome, p.id]));
  for (const nome of ["Gabi", "Isa"]) {
    if (!pessoaPorNome.has(nome)) {
      throw new Error(`Pessoa não encontrada: ${nome}`);
    }
  }

  const candidatas = receitas.flatMap((receita) =>
    receita.valoresReal.map((valor, indice) => ({
      pessoaId: pessoaPorNome.get(receita.pessoa)!,
      subtipo: receita.subtipo,
      descricao: receita.descricao,
      valorCentavos: centavos(valor),
      mes: mes2026(indice + 1),
      householdId: household.id,
    })),
  ).filter((receita) => receita.valorCentavos > 0);

  const existentes = await prisma.receita.findMany({
    where: {
      householdId: household.id,
      mes: { gte: mes2026(1), lte: mes2026(7) },
    },
    select: {
      pessoaId: true,
      subtipo: true,
      descricao: true,
      valorCentavos: true,
      mes: true,
    },
  });
  const chave = (receita: {
    pessoaId: string;
    subtipo: SubtipoReceita;
    descricao: string | null;
    valorCentavos: number;
    mes: Date;
  }) =>
    [
      receita.pessoaId,
      receita.subtipo,
      receita.descricao ?? "",
      receita.valorCentavos,
      receita.mes.toISOString().slice(0, 10),
    ].join("|");

  const chavesExistentes = new Set(existentes.map(chave));
  const novas = candidatas.filter((receita) => !chavesExistentes.has(chave(receita)));

  console.log(`Household: ${household.nome}`);
  console.log(`Receitas válidas: ${candidatas.length}`);
  console.log(`Receitas novas: ${novas.length}`);
  console.log(`Duplicadas ignoradas: ${candidatas.length - novas.length}`);

  if (!APPLY) {
    console.log("Modo simulação. Rode com --apply para gravar.");
    return;
  }

  if (novas.length === 0) return;

  const resultado = await prisma.receita.createMany({ data: novas });
  console.log(`Receitas criadas: ${resultado.count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
