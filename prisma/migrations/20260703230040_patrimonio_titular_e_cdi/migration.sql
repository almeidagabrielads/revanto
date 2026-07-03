-- DropIndex
DROP INDEX "PosicaoPatrimonio_householdId_bancoId_mes_key";

-- AlterTable
ALTER TABLE "PosicaoPatrimonio" ADD COLUMN     "pessoaId" TEXT;

-- CreateTable
CREATE TABLE "CdiMensal" (
    "id" TEXT NOT NULL,
    "mes" DATE NOT NULL,
    "percentual" DECIMAL(6,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CdiMensal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CdiMensal_mes_key" ON "CdiMensal"("mes");

-- CreateIndex
-- NULLS NOT DISTINCT (mesmo padrão da migration 20260702010200): impede
-- duplicar a posição "do casal" (pessoaId nulo) para o mesmo banco/mês.
CREATE UNIQUE INDEX "PosicaoPatrimonio_householdId_bancoId_pessoaId_mes_key"
  ON "PosicaoPatrimonio" ("householdId", "bancoId", "pessoaId", "mes")
  NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "PosicaoPatrimonio" ADD CONSTRAINT "PosicaoPatrimonio_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
