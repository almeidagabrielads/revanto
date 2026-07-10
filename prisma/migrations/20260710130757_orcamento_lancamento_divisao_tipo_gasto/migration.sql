-- CreateEnum
CREATE TYPE "TipoGasto" AS ENUM ('FIXO', 'VARIAVEL', 'INVESTIMENTO');

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "tipoGasto" "TipoGasto" NOT NULL DEFAULT 'VARIAVEL';

-- AlterTable
ALTER TABLE "OrcamentoPlanejado" ADD COLUMN     "divisaoId" TEXT,
ADD COLUMN     "tipoGasto" "TipoGasto" NOT NULL DEFAULT 'VARIAVEL';

-- CreateIndex
CREATE INDEX "OrcamentoPlanejado_householdId_divisaoId_idx" ON "OrcamentoPlanejado"("householdId", "divisaoId");

-- AddForeignKey
ALTER TABLE "OrcamentoPlanejado" ADD CONSTRAINT "OrcamentoPlanejado_divisaoId_fkey" FOREIGN KEY ("divisaoId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
