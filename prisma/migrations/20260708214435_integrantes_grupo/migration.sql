-- AlterTable
ALTER TABLE "public"."Pessoa" DROP COLUMN "pesoDivisao";

-- CreateTable
CREATE TABLE "public"."IntegranteGrupo" (
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
CREATE UNIQUE INDEX "IntegranteGrupo_grupoId_pessoaId_key" ON "public"."IntegranteGrupo"("grupoId" ASC, "pessoaId" ASC);

-- CreateIndex
CREATE INDEX "IntegranteGrupo_householdId_idx" ON "public"."IntegranteGrupo"("householdId" ASC);

-- CreateIndex
CREATE INDEX "IntegranteGrupo_pessoaId_idx" ON "public"."IntegranteGrupo"("pessoaId" ASC);

-- AddForeignKey
ALTER TABLE "public"."IntegranteGrupo" ADD CONSTRAINT "IntegranteGrupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "public"."Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegranteGrupo" ADD CONSTRAINT "IntegranteGrupo_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegranteGrupo" ADD CONSTRAINT "IntegranteGrupo_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "public"."Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
