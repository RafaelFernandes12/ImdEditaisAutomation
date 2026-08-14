/*
  Warnings:

  - Changed the type of `conversation` on the `AiChat` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "AiChat" DROP COLUMN "conversation",
ADD COLUMN     "conversation" JSON NOT NULL;
