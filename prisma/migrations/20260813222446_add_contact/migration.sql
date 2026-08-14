-- CreateTable
CREATE TABLE "WppChat" (
    "id" TEXT NOT NULL,
    "contact" TEXT NOT NULL,

    CONSTRAINT "WppChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EditalToWppChat" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EditalToWppChat_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "WppChat_contact_key" ON "WppChat"("contact");

-- CreateIndex
CREATE INDEX "_EditalToWppChat_B_index" ON "_EditalToWppChat"("B");

-- AddForeignKey
ALTER TABLE "_EditalToWppChat" ADD CONSTRAINT "_EditalToWppChat_A_fkey" FOREIGN KEY ("A") REFERENCES "Edital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EditalToWppChat" ADD CONSTRAINT "_EditalToWppChat_B_fkey" FOREIGN KEY ("B") REFERENCES "WppChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
