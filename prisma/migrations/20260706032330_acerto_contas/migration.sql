-- CreateTable
CREATE TABLE "AcertoContas" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "dataInicio" DATE NOT NULL,
    "dataFim" DATE NOT NULL,
    "deId" TEXT NOT NULL,
    "paraId" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "resolvidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidoPorUserId" TEXT,

    CONSTRAINT "AcertoContas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcertoContas_householdId_resolvidoEm_idx" ON "AcertoContas"("householdId", "resolvidoEm");

-- AddForeignKey
ALTER TABLE "AcertoContas" ADD CONSTRAINT "AcertoContas_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcertoContas" ADD CONSTRAINT "AcertoContas_deId_fkey" FOREIGN KEY ("deId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcertoContas" ADD CONSTRAINT "AcertoContas_paraId_fkey" FOREIGN KEY ("paraId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
