/*
  Warnings:

  - Made the column `pessoaId` on table `OrcamentoPlanejado` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "OrcamentoPlanejado" DROP CONSTRAINT "OrcamentoPlanejado_pessoaId_fkey";

-- AlterTable
ALTER TABLE "OrcamentoPlanejado" ALTER COLUMN "pessoaId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "OrcamentoPlanejado" ADD CONSTRAINT "OrcamentoPlanejado_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
