/*
  Warnings:

  - You are about to drop the `EditalToUser` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PdfSends` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "EditalToUser" DROP CONSTRAINT "EditalToUser_editalId_fkey";

-- DropForeignKey
ALTER TABLE "EditalToUser" DROP CONSTRAINT "EditalToUser_userId_fkey";

-- DropForeignKey
ALTER TABLE "PdfSends" DROP CONSTRAINT "PdfSends_editalToUserId_fkey";

-- DropForeignKey
ALTER TABLE "PdfSends" DROP CONSTRAINT "PdfSends_pdfId_fkey";

-- DropTable
DROP TABLE "EditalToUser";

-- DropTable
DROP TABLE "PdfSends";

-- CreateTable
CREATE TABLE "Sends" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "pdfId" INTEGER NOT NULL,
    "editalId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Sends_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Sends" ADD CONSTRAINT "Sends_pdfId_fkey" FOREIGN KEY ("pdfId") REFERENCES "Pdf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sends" ADD CONSTRAINT "Sends_editalId_fkey" FOREIGN KEY ("editalId") REFERENCES "Edital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sends" ADD CONSTRAINT "Sends_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
