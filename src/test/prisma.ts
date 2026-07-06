import { config } from "dotenv";
config({ path: ".env.local", override: true });
config({ path: ".env" });

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Cliente dedicado ao banco de testes; DATABASE_URL_TEST deve apontar para
// finance_manager_test (banco separado do dev, nunca o de produção).
const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error(
    "DATABASE_URL_TEST não definida — configure .env.local antes de rodar testes de integração",
  );
}

const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
export const prismaTest = new PrismaClient({ adapter });

// Apaga todos os dados na ordem inversa das FKs para permitir truncagem limpa.
export async function limparBanco() {
  await prismaTest.$transaction([
    prismaTest.lancamento.deleteMany(),
    prismaTest.receita.deleteMany(),
    prismaTest.orcamentoPlanejado.deleteMany(),
    prismaTest.posicaoPatrimonio.deleteMany(),
    prismaTest.cdiMensal.deleteMany(),
    prismaTest.investimento.deleteMany(),
    prismaTest.subcategoria.deleteMany(),
    prismaTest.categoria.deleteMany(),
    prismaTest.banco.deleteMany(),
    prismaTest.acertoContas.deleteMany(),
    prismaTest.atividadeLog.deleteMany(),
    prismaTest.pessoa.deleteMany(),
    prismaTest.user.deleteMany(),
    prismaTest.preferencia.deleteMany(),
    prismaTest.household.deleteMany(),
  ]);
}
