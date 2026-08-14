/*
  Warnings:

  - Added the required column `conversation` to the `AiChat` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AiChat" ADD COLUMN     "conversation" TEXT NOT NULL;
