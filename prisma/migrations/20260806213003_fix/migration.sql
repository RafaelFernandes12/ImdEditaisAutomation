/*
  Warnings:

  - You are about to drop the column `pdfLinksId` on the `Pdf` table. All the data in the column will be lost.
  - Added the required column `pdfTextId` to the `Pdf` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Pdf" DROP CONSTRAINT "Pdf_pdfLinksId_fkey";

-- AlterTable
ALTER TABLE "Pdf" DROP COLUMN "pdfLinksId",
ADD COLUMN     "pdfTextId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Pdf" ADD CONSTRAINT "Pdf_pdfTextId_fkey" FOREIGN KEY ("pdfTextId") REFERENCES "PdfText"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
