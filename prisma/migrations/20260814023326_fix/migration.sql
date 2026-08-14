/*
  Warnings:

  - You are about to drop the column `chatId` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_chatId_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "chatId";
