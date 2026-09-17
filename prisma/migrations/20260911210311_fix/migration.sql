-- CreateTable
CREATE TABLE "UserSubscriptionsEditais" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "editalId" INTEGER NOT NULL,
    "status" "StatusEdital" NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "UserSubscriptionsEditais_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserSubscriptionsEditais" ADD CONSTRAINT "UserSubscriptionsEditais_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscriptionsEditais" ADD CONSTRAINT "UserSubscriptionsEditais_editalId_fkey" FOREIGN KEY ("editalId") REFERENCES "Edital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
