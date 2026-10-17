-- Desfaz o split de 20260917140000: "edital" e "vaga" voltam para dentro de "job".
-- Escrita à mão para não perder dados (o SQL gerado dropava as tabelas e o pdf.edital_id).

-- CreateEnum
CREATE TYPE "Modelo" AS ENUM ('CLT', 'PJ', 'ESTAGIO', 'FREELANCE', 'BOLSISTA');
CREATE TYPE "Formato" AS ENUM ('PRESENCIAL', 'HIBRIDO', 'REMOTO', 'NAO_INFORMADO');
CREATE TYPE "job_kind" AS ENUM ('EDITAL', 'VAGA');

-- Níveis acadêmicos (editais). Nada abaixo usa esses valores, então o ADD VALUE
-- pode ficar na mesma transação.
ALTER TYPE "Senioridade" ADD VALUE 'GRADUACAO';
ALTER TYPE "Senioridade" ADD VALUE 'GRADUADO';
ALTER TYPE "Senioridade" ADD VALUE 'MESTRADO';
ALTER TYPE "Senioridade" ADD VALUE 'DOUTORADO';

-- AlterTable: colunas nullable primeiro, NOT NULL depois do backfill
ALTER TABLE "job" ADD COLUMN "kind" "job_kind",
ADD COLUMN "description" TEXT,
ADD COLUMN "subscription_until" TIMESTAMP(3),
ADD COLUMN "valid_until" TIMESTAMP(3),
ADD COLUMN "formato" "Formato",
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "modelo" "Modelo"[],
ADD COLUMN "senioridade" "Senioridade"[];

-- Backfill: kind sai do type (mesmo mapa de JOB_TYPES)
UPDATE "job" SET "kind" = (CASE WHEN "type" IN ('IMD', 'STI') THEN 'EDITAL' ELSE 'VAGA' END)::"job_kind";

UPDATE "job" j SET "subscription_until" = e."subscription_until", "valid_until" = e."valid_until"
FROM "edital" e WHERE e."job_id" = j."id";

UPDATE "job" j SET "description" = v."description"
FROM "vaga" v WHERE v."job_id" = j."id";

-- Edital: description é o texto do primeiro pdf (o que foi resumido)
UPDATE "job" j SET "description" = p."text"
FROM (SELECT DISTINCT ON ("edital_id") "edital_id", "text" FROM "pdf" ORDER BY "edital_id", "id") p
WHERE p."edital_id" = j."id" AND j."description" IS NULL;

UPDATE "job" SET "description" = '' WHERE "description" IS NULL;

-- Linhas antigas não têm resumo estruturado: tudo "não informado"
UPDATE "job" SET
  "formato" = 'NAO_INFORMADO',
  "city" = 'Não informado',
  "state" = 'Não informado',
  "modelo" = ARRAY[]::"Modelo"[],
  "senioridade" = ARRAY[]::"Senioridade"[];

ALTER TABLE "job" ALTER COLUMN "kind" SET NOT NULL,
ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "formato" SET NOT NULL,
ALTER COLUMN "city" SET NOT NULL,
ALTER COLUMN "state" SET NOT NULL;

-- RenameColumn: pdf.edital_id -> pdf.job_id. Os valores são os mesmos, porque
-- edital.job_id = job.id; só o alvo da FK muda.
ALTER TABLE "pdf" DROP CONSTRAINT "pdf_edital_id_fkey";
ALTER TABLE "pdf" RENAME COLUMN "edital_id" TO "job_id";
ALTER TABLE "pdf" ADD CONSTRAINT "pdf_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropTable
DROP TABLE "edital";
DROP TABLE "vaga";

-- user_preferences: o antigo "modelo" (ModeloTrabalho[]) guardava presencial/híbrido/remoto,
-- que agora é "formato" (um só). O novo "modelo" é o tipo de contrato e começa vazio.
ALTER TABLE "user_preferences" ADD COLUMN "formato" "Formato";
UPDATE "user_preferences" SET "formato" = COALESCE("modelo"[1]::text, 'PRESENCIAL')::"Formato";
ALTER TABLE "user_preferences" ALTER COLUMN "formato" SET NOT NULL;
ALTER TABLE "user_preferences" DROP COLUMN "modelo";
ALTER TABLE "user_preferences" ADD COLUMN "modelo" "Modelo"[];
UPDATE "user_preferences" SET "modelo" = ARRAY[]::"Modelo"[];

-- DropEnum
DROP TYPE "ModeloTrabalho";
