/*
  Warnings:

  - You are about to drop the column `chatId` on the `AiChat` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[conversationId]` on the table `AiChat` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `conversationId` to the `AiChat` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "AiChat_chatId_key";

-- AlterTable
ALTER TABLE "AiChat" DROP COLUMN "chatId",
ADD COLUMN     "conversationId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AiChat_conversationId_key" ON "AiChat"("conversationId");
