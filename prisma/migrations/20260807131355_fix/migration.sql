/*
  Warnings:

  - A unique constraint covering the columns `[badge]` on the table `Pdf` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Pdf_badge_key" ON "Pdf"("badge");
