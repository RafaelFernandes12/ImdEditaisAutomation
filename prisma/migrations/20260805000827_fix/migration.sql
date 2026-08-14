/*
  Warnings:

  - Made the column `created_at` on table `AiChat` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `AiChat` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "AiChat" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" SET NOT NULL;
