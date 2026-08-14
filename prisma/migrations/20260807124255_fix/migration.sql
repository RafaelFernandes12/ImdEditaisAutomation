/*
  Warnings:

  - You are about to drop the column `pdfTextId` on the `Pdf` table. All the data in the column will be lost.
  - Added the required column `isActive` to the `Pdf` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Pdf` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pdfId` to the `PdfText` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `PdfText` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Pdf" DROP CONSTRAINT "Pdf_pdfTextId_fkey";

-- AlterTable
ALTER TABLE "Pdf" DROP COLUMN "pdfTextId",
ADD COLUMN     "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(6) NOT NULL;

-- AlterTable
ALTER TABLE "PdfText" ADD COLUMN     "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "pdfId" INTEGER NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(6) NOT NULL;

-- AddForeignKey
ALTER TABLE "PdfText" ADD CONSTRAINT "PdfText_pdfId_fkey" FOREIGN KEY ("pdfId") REFERENCES "Pdf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
