-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "investimentoResgateId" TEXT,
ADD COLUMN     "pagoComResgateInvestimento" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Lancamento_householdId_investimentoResgateId_idx" ON "Lancamento"("householdId", "investimentoResgateId");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_investimentoResgateId_fkey" FOREIGN KEY ("investimentoResgateId") REFERENCES "Investimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
