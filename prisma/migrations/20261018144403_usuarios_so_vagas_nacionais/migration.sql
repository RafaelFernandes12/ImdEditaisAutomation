-- AlterTable
ALTER TABLE "user_preferences" ALTER COLUMN "is_international" SET DEFAULT false;

-- Todos os usuários cadastrados só querem vagas nacionais.
UPDATE "user_preferences" SET "is_international" = false;
