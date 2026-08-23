-- AlterTable
ALTER TABLE "User" ADD COLUMN     "extensionToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_extensionToken_key" ON "User"("extensionToken");

