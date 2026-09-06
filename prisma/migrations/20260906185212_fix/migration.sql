/*
  Warnings:

  - The primary key for the `Sends` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Sends` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Sends" DROP CONSTRAINT "Sends_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "Sends_pkey" PRIMARY KEY ("pdfId", "editalId", "userId");
