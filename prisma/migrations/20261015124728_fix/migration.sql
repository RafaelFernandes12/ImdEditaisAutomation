/*
  Warnings:

  - The values [GRADUACAO,GRADUADO,MESTRADO,DOUTORADO] on the enum `Senioridade` will be removed. If these variants are still used in the database, this will fail.
  - Changed the column `formato` on the `user_preferences` table from a scalar field to a list field. If there are non-null values in that column, this step will fail.

*/
-- CreateEnum
CREATE TYPE "Escolaridade" AS ENUM ('GRADUACAO', 'GRADUADO', 'MESTRADO', 'DOUTORADO');

-- AlterEnum
BEGIN;
CREATE TYPE "Senioridade_new" AS ENUM ('ESTAGIO', 'TRAINEE', 'JUNIOR', 'PLENO', 'SENIOR', 'TECHLEAD');
ALTER TABLE "vaga" ALTER COLUMN "senioridade" TYPE "Senioridade_new" USING ("senioridade"::text::"Senioridade_new");
ALTER TABLE "user_preferences" ALTER COLUMN "senioridade" TYPE "Senioridade_new"[] USING ("senioridade"::text::"Senioridade_new"[]);
ALTER TYPE "Senioridade" RENAME TO "Senioridade_old";
ALTER TYPE "Senioridade_new" RENAME TO "Senioridade";
DROP TYPE "public"."Senioridade_old";
COMMIT;

-- AlterTable
ALTER TABLE "user_preferences" ALTER COLUMN "formato" SET DATA TYPE "Formato"[] USING ARRAY["formato"];

-- AlterTable
ALTER TABLE "vaga" ADD COLUMN     "escolaridade" "Escolaridade";
