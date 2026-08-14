/*
  Warnings:

  - The `conversation` column on the `AiChat` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "AiChat" DROP COLUMN "conversation",
ADD COLUMN     "conversation" JSON[];
