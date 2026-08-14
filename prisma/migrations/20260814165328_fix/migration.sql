/*
  Warnings:

  - Added the required column `type` to the `Pdf` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StatusEdital" AS ENUM ('SENDED', 'ONGOING', 'FAILED', 'RESERVA', 'SUCESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PdfTipo" AS ENUM ('EDITAL', 'HOMOLOGACAO', 'RESULTADO');

-- AlterTable
ALTER TABLE "Pdf" ADD COLUMN     "type" "PdfTipo" NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(6) NOT NULL;

-- CreateTable
CREATE TABLE "EditalToUser" (
    "id" SERIAL NOT NULL,
    "editalId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "StatusEdital" NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "EditalToUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfSends" (
    "id" SERIAL NOT NULL,
    "pdfId" INTEGER NOT NULL,
    "editalToUserId" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "PdfSends_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EditalToUser" ADD CONSTRAINT "EditalToUser_editalId_fkey" FOREIGN KEY ("editalId") REFERENCES "Edital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditalToUser" ADD CONSTRAINT "EditalToUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfSends" ADD CONSTRAINT "PdfSends_pdfId_fkey" FOREIGN KEY ("pdfId") REFERENCES "Pdf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfSends" ADD CONSTRAINT "PdfSends_editalToUserId_fkey" FOREIGN KEY ("editalToUserId") REFERENCES "EditalToUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
