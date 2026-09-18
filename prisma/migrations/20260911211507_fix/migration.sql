/*
  Warnings:

  - You are about to drop the `UserSubscriptionsEditais` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserSubscriptionsEditais" DROP CONSTRAINT "UserSubscriptionsEditais_editalId_fkey";

-- DropForeignKey
ALTER TABLE "UserSubscriptionsEditais" DROP CONSTRAINT "UserSubscriptionsEditais_userId_fkey";

-- DropTable
DROP TABLE "UserSubscriptionsEditais";

-- CreateTable
CREATE TABLE "UserSubscriptions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "editalId" INTEGER NOT NULL,
    "status" "StatusEdital" NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "UserSubscriptions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserSubscriptions" ADD CONSTRAINT "UserSubscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscriptions" ADD CONSTRAINT "UserSubscriptions_editalId_fkey" FOREIGN KEY ("editalId") REFERENCES "Edital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
