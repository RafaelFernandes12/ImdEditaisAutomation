-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "is_international" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "vaga" ADD COLUMN     "is_international" BOOLEAN NOT NULL DEFAULT false;
