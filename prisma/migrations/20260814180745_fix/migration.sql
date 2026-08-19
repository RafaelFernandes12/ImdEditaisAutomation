/*
  Warnings:

  - A unique constraint covering the columns `[matricula]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `matricula` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "matricula" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_matricula_key" ON "User"("matricula");
