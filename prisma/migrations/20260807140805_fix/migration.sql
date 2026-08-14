/*
  Warnings:

  - You are about to drop the column `badge` on the `Pdf` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `Pdf` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Pdf` table. All the data in the column will be lost.
  - You are about to drop the `PdfText` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[link]` on the table `Pdf` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `editalId` to the `Pdf` table without a default value. This is not possible if the table is not empty.
  - Added the required column `label` to the `Pdf` table without a default value. This is not possible if the table is not empty.
  - Added the required column `link` to the `Pdf` table without a default value. This is not possible if the table is not empty.
  - Added the required column `text` to the `Pdf` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PdfText" DROP CONSTRAINT "PdfText_pdfId_fkey";

-- DropIndex
DROP INDEX "Pdf_badge_key";

-- AlterTable
ALTER TABLE "Pdf" DROP COLUMN "badge",
DROP COLUMN "isActive",
DROP COLUMN "title",
ADD COLUMN     "editalId" INTEGER NOT NULL,
ADD COLUMN     "label" TEXT NOT NULL,
ADD COLUMN     "link" TEXT NOT NULL,
ADD COLUMN     "text" TEXT NOT NULL;

-- DropTable
DROP TABLE "PdfText";

-- CreateTable
CREATE TABLE "Edital" (
    "id" SERIAL NOT NULL,
    "badge" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "Edital_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Edital_badge_key" ON "Edital"("badge");

-- CreateIndex
CREATE UNIQUE INDEX "Edital_link_key" ON "Edital"("link");

-- CreateIndex
CREATE UNIQUE INDEX "Pdf_link_key" ON "Pdf"("link");

-- AddForeignKey
ALTER TABLE "Pdf" ADD CONSTRAINT "Pdf_editalId_fkey" FOREIGN KEY ("editalId") REFERENCES "Edital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
