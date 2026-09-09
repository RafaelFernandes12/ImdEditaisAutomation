/*
  Warnings:

  - Changed the type of `subscriptionUntil` on the `Edital` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Edital"
ALTER COLUMN "subscriptionUntil" TYPE TIMESTAMP(3)
USING to_timestamp(
  substring("subscriptionUntil" from '\d{2}/\d{2}/\d{4}'),
  'DD/MM/YYYY'
);
