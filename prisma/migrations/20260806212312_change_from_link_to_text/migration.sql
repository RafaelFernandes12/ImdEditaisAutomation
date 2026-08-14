/*
  Warnings:

  - You are about to drop the column `link` on the `PdfLinks` table. All the data in the column will be lost.
  - Added the required column `text` to the `PdfLinks` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PdfLinks" DROP COLUMN "link",
ADD COLUMN     "text" TEXT NOT NULL;
