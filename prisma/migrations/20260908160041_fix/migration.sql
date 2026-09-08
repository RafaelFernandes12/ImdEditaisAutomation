/*
  Warnings:

  - Added the required column `finishedAt` to the `Edital` table without a default value. This is not possible if the table is not empty.
  - Added the required column `validUntil` to the `Edital` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Edital" ADD COLUMN     "finishedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "validUntil" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "Reminders" (
    "id" SERIAL NOT NULL,
    "reminder" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Reminders_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Reminders" ADD CONSTRAINT "Reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
