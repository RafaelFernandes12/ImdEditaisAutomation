/*
  Warnings:

  - You are about to drop the `PdfLinks` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Pdf" DROP CONSTRAINT "Pdf_pdfLinksId_fkey";

-- DropTable
DROP TABLE "PdfLinks";

-- CreateTable
CREATE TABLE "PdfText" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "link" TEXT NOT NULL,

    CONSTRAINT "PdfText_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Pdf" ADD CONSTRAINT "Pdf_pdfLinksId_fkey" FOREIGN KEY ("pdfLinksId") REFERENCES "PdfText"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
