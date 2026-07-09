-- CreateTable
CREATE TABLE "IntegranteGrupo" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "peso" INTEGER NOT NULL DEFAULT 100,
    "householdId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegranteGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegranteGrupo_householdId_idx" ON "IntegranteGrupo"("householdId");

-- CreateIndex
CREATE INDEX "IntegranteGrupo_pessoaId_idx" ON "IntegranteGrupo"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegranteGrupo_grupoId_pessoaId_key" ON "IntegranteGrupo"("grupoId", "pessoaId");

-- AddForeignKey
ALTER TABLE "IntegranteGrupo" ADD CONSTRAINT "IntegranteGrupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegranteGrupo" ADD CONSTRAINT "IntegranteGrupo_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegranteGrupo" ADD CONSTRAINT "IntegranteGrupo_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: preserva o rateio já em uso hoje, associando cada grupo
-- CASAL/FAMILIA a todas as pessoas INDIVIDUAL do mesmo household, usando o
-- pesoDivisao atual de cada uma como peso do integrante. Sem isso, o acerto
-- de contas de households que já usam CASAL/FAMILIA mudaria silenciosamente
-- assim que a coluna pesoDivisao for removida abaixo.
INSERT INTO "IntegranteGrupo" ("id", "grupoId", "pessoaId", "peso", "householdId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, g.id, i.id, i."pesoDivisao", g."householdId", now(), now()
FROM "Pessoa" g
JOIN "Pessoa" i ON i."householdId" = g."householdId" AND i.tipo = 'INDIVIDUAL'
WHERE g.tipo IN ('CASAL', 'FAMILIA');

-- AlterTable
ALTER TABLE "Pessoa" DROP COLUMN "pesoDivisao";
