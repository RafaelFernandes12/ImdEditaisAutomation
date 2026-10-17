-- Tira o resumo da IA de "job" e leva para a nova tabela "vaga", porque um job
-- (ex.: edital) pode ter mais de uma vaga. Escrita à mão: o SQL gerado só
-- dropava as colunas e perdia summary/key_words.
-- Cada job vira exatamente uma vaga, com o summary que a IA já gerou para ele.

-- CreateTable
CREATE TABLE "vaga" (
    "id" SERIAL NOT NULL,
    "summary" TEXT NOT NULL,
    "key_words" TEXT NOT NULL,
    "ecossytem" TEXT NOT NULL DEFAULT '',
    "salary" DOUBLE PRECISION,
    "formato" "Formato",
    "city" TEXT,
    "state" TEXT,
    "modelo" "Modelo",
    "senioridade" "Senioridade",
    "job_id" INTEGER NOT NULL,

    CONSTRAINT "vaga_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "vaga" ADD CONSTRAINT "vaga_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: uma vaga por job. modelo/senioridade eram arrays e agora são um
-- valor só; fica o primeiro (array vazio ou NULL vira NULL).
INSERT INTO "vaga" ("summary", "key_words", "ecossytem", "salary", "formato", "city", "state", "modelo", "senioridade", "job_id")
SELECT "summary", "key_words", "ecossytem", "salary", "formato", "city", "state", "modelo"[1], "senioridade"[1], "id"
FROM "job"
ORDER BY "id";

-- AlterTable
ALTER TABLE "job" DROP COLUMN "city",
DROP COLUMN "ecossytem",
DROP COLUMN "formato",
DROP COLUMN "key_words",
DROP COLUMN "modelo",
DROP COLUMN "salary",
DROP COLUMN "senioridade",
DROP COLUMN "state",
DROP COLUMN "summary";

-- user_subscriptions saiu do schema. Só dropa se estiver vazia: se tiver linhas,
-- a migration falha (e a transação desfaz tudo acima) em vez de perder dados.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "user_subscriptions") THEN
    RAISE EXCEPTION 'user_subscriptions tem linhas; exporte/migre antes de dropar';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "user_subscriptions" DROP CONSTRAINT "user_subscriptions_job_id_fkey";
ALTER TABLE "user_subscriptions" DROP CONSTRAINT "user_subscriptions_user_id_fkey";

-- DropTable
DROP TABLE "user_subscriptions";
