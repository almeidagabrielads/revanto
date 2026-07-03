-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "hashImportacao" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lancamento_householdId_hashImportacao_key" ON "Lancamento"("householdId", "hashImportacao");
