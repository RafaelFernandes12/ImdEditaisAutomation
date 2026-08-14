/*
  Warnings:

  - A unique constraint covering the columns `[link]` on the table `PdfText` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PdfText_link_key" ON "PdfText"("link");
