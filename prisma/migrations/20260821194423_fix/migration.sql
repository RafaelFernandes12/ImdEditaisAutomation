/*
  Warnings:

  - The values [ONGOING,COMPLETED] on the enum `StatusEdital` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "StatusEdital_new" AS ENUM ('SENDED', 'HOMOLOGACAO', 'ENTREVISTA', 'RESERVA', 'SUCESS', 'FAILED');
ALTER TABLE "EditalToUser" ALTER COLUMN "status" TYPE "StatusEdital_new" USING ("status"::text::"StatusEdital_new");
ALTER TYPE "StatusEdital" RENAME TO "StatusEdital_old";
ALTER TYPE "StatusEdital_new" RENAME TO "StatusEdital";
DROP TYPE "public"."StatusEdital_old";
COMMIT;
