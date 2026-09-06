/*
  Warnings:

  - You are about to drop the column `curriculoLattes` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `curriculoVitae` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `matricula` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_matricula_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "curriculoLattes",
DROP COLUMN "curriculoVitae",
DROP COLUMN "matricula";
