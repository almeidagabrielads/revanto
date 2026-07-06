-- AlterTable
ALTER TABLE "Categoria" DROP COLUMN "percentualOrcamento";

-- AlterTable
ALTER TABLE "Subcategoria" ADD COLUMN     "orcamentoCentavos" INTEGER;
