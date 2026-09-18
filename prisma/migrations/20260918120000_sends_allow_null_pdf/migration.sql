/*
  Warnings:

  - The primary key for the `Sends` table will be changed. A surrogate `id` replaces
    the composite key ("pdfId", "jobId", "userId") so that `pdfId` can be nullable.
  - `pdfId` becomes optional: vagas JERIMUM não têm PDF e por isso nunca geravam
    registro de envio, o que fazia elas serem reenviadas em toda execução do cron.
  - Nenhum backfill é necessário: as linhas existentes têm `pdfId` preenchido e
    continuam únicas sob o novo índice.

*/
-- AlterTable
ALTER TABLE "Sends" DROP CONSTRAINT "Sends_pkey",
ADD COLUMN "id" SERIAL NOT NULL,
ALTER COLUMN "pdfId" DROP NOT NULL,
ADD CONSTRAINT "Sends_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "Sends_userId_jobId_pdfId_key" ON "Sends"("userId", "jobId", "pdfId");
