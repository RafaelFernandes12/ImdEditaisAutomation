/*
  Warnings:

  - You are about to drop the `WppChat` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_EditalToWppChat` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_EditalToWppChat" DROP CONSTRAINT "_EditalToWppChat_A_fkey";

-- DropForeignKey
ALTER TABLE "_EditalToWppChat" DROP CONSTRAINT "_EditalToWppChat_B_fkey";

-- DropTable
DROP TABLE "WppChat";

-- DropTable
DROP TABLE "_EditalToWppChat";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "contact" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EditalToUser" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EditalToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_contact_key" ON "User"("contact");

-- CreateIndex
CREATE INDEX "_EditalToUser_B_index" ON "_EditalToUser"("B");

-- AddForeignKey
ALTER TABLE "_EditalToUser" ADD CONSTRAINT "_EditalToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Edital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EditalToUser" ADD CONSTRAINT "_EditalToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
