-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('PROPRIETARIO', 'ADMIN', 'EDITOR', 'VISUALIZADOR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastDevice" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "role" "PapelUsuario" NOT NULL DEFAULT 'EDITOR';

-- CreateTable
CREATE TABLE "AtividadeLog" (
    "id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "dispositivo" TEXT,
    "householdId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtividadeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AtividadeLog_householdId_createdAt_idx" ON "AtividadeLog"("householdId", "createdAt");

-- AddForeignKey
ALTER TABLE "AtividadeLog" ADD CONSTRAINT "AtividadeLog_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtividadeLog" ADD CONSTRAINT "AtividadeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
