-- CreateTable
CREATE TABLE "Pdf" (
    "id" SERIAL NOT NULL,
    "badge" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pdfLinksId" INTEGER NOT NULL,

    CONSTRAINT "Pdf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfLinks" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "link" TEXT NOT NULL,

    CONSTRAINT "PdfLinks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Pdf" ADD CONSTRAINT "Pdf_pdfLinksId_fkey" FOREIGN KEY ("pdfLinksId") REFERENCES "PdfLinks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
