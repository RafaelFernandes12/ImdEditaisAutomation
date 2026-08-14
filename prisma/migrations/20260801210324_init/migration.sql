-- CreateTable
CREATE TABLE "AiChat" (
    "id" INTEGER NOT NULL,
    "chatId" TEXT NOT NULL,

    CONSTRAINT "AiChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiChat_chatId_key" ON "AiChat"("chatId");
