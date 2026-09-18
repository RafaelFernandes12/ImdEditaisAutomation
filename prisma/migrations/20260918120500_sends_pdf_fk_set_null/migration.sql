/*
  Com `pdfId` opcional, a ação referencial esperada pelo Prisma para a relação
  opcional passa a ser ON DELETE SET NULL (antes era RESTRICT, padrão de relação
  obrigatória). Sem isso o `prisma migrate diff` acusa drift.
*/
-- DropForeignKey
ALTER TABLE "Sends" DROP CONSTRAINT "Sends_pdfId_fkey";

-- AddForeignKey
ALTER TABLE "Sends" ADD CONSTRAINT "Sends_pdfId_fkey" FOREIGN KEY ("pdfId") REFERENCES "Pdf"("id") ON DELETE SET NULL ON UPDATE CASCADE;
