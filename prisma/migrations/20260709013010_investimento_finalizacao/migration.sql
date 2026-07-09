-- CreateEnum
CREATE TYPE "StatusInvestimento" AS ENUM ('ATIVO', 'FINALIZADO');

-- AlterTable
ALTER TABLE "Receita" ADD COLUMN     "investimentoId" TEXT;

-- AlterTable
ALTER TABLE "Investimento" ADD COLUMN     "finalizadoEm" TIMESTAMP(3),
ADD COLUMN     "investimentoOrigemId" TEXT,
ADD COLUMN     "status" "StatusInvestimento" NOT NULL DEFAULT 'ATIVO',
ADD COLUMN     "valorReinvestidoCentavos" INTEGER,
ADD COLUMN     "valorResgatadoCentavos" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Receita_investimentoId_key" ON "Receita"("investimentoId");

-- AddForeignKey
ALTER TABLE "Receita" ADD CONSTRAINT "Receita_investimentoId_fkey" FOREIGN KEY ("investimentoId") REFERENCES "Investimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investimento" ADD CONSTRAINT "Investimento_investimentoOrigemId_fkey" FOREIGN KEY ("investimentoOrigemId") REFERENCES "Investimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
