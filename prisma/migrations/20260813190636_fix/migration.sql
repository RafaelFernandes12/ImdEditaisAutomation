/*
  Warnings:

  - Added the required column `subscriptionUntil` to the `Edital` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Edital" ADD COLUMN     "subscriptionUntil" TEXT NOT NULL;
