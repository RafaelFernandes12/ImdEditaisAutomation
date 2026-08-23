/*
  Warnings:

  - Added the required column `keyWords` to the `Edital` table without a default value. This is not possible if the table is not empty.
  - Added the required column `summary` to the `Edital` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Edital" ADD COLUMN     "keyWords" TEXT NOT NULL,
ADD COLUMN     "summary" TEXT NOT NULL;
