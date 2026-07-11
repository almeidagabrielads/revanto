-- CreateTable
CREATE TABLE "CalculadoraHistorico" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "expressao" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalculadoraHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculadoraAnotacao" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "texto" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalculadoraAnotacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalculadoraHistorico_householdId_createdAt_idx" ON "CalculadoraHistorico"("householdId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalculadoraAnotacao_householdId_key" ON "CalculadoraAnotacao"("householdId");

-- AddForeignKey
ALTER TABLE "CalculadoraHistorico" ADD CONSTRAINT "CalculadoraHistorico_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculadoraAnotacao" ADD CONSTRAINT "CalculadoraAnotacao_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
