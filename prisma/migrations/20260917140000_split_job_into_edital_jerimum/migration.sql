-- RenameTable: Jobs -> Job
ALTER TABLE "Jobs" RENAME TO "Job";
ALTER TABLE "Job" RENAME CONSTRAINT "Jobs_pkey" TO "Job_pkey";
ALTER INDEX "Jobs_title_key" RENAME TO "Job_title_key";
ALTER INDEX "Jobs_link_key" RENAME TO "Job_link_key";
ALTER SEQUENCE "Jobs_id_seq" RENAME TO "Job_id_seq";

-- Guard: o backfill abaixo assume que tudo que existe hoje é edital
-- (o scraper do jerimum nunca persistiu nada).
DO $$
DECLARE jerimum_count INT;
BEGIN
  SELECT COUNT(*) INTO jerimum_count FROM "Job" WHERE "type" = 'JERIMUM';
  IF jerimum_count > 0 THEN
    RAISE EXCEPTION 'Existem % linhas JERIMUM em "Job"; backfill para "Edital" abortado', jerimum_count;
  END IF;
END $$;

-- CreateTable
CREATE TABLE "Edital" (
    "jobId" INTEGER NOT NULL,
    "subscriptionUntil" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),

    CONSTRAINT "Edital_pkey" PRIMARY KEY ("jobId")
);

-- CreateTable
CREATE TABLE "Jerimum" (
    "jobId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,

    CONSTRAINT "Jerimum_pkey" PRIMARY KEY ("jobId")
);

-- Backfill: toda linha existente vira um Edital, levando junto as duas colunas.
-- Precisa rodar antes do DROP COLUMN e antes da FK de "Pdf".
INSERT INTO "Edital" ("jobId", "subscriptionUntil", "validUntil")
SELECT "id", "subscriptionUntil", "validUntil" FROM "Job";

-- AddForeignKey: filhas -> pai (PK compartilhada, garante o 1:1)
ALTER TABLE "Edital" ADD CONSTRAINT "Edital_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Jerimum" ADD CONSTRAINT "Jerimum_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameColumn: Pdf.jobId -> Pdf.editalId. Os valores são os mesmos, porque
-- Edital.jobId = Job.id; só o alvo da FK muda. O DROP vem antes do rename
-- porque renomear coluna não move o alvo da constraint.
ALTER TABLE "Pdf" DROP CONSTRAINT "Pdf_jobId_fkey";
ALTER TABLE "Pdf" RENAME COLUMN "jobId" TO "editalId";
ALTER TABLE "Pdf" ADD CONSTRAINT "Pdf_editalId_fkey" FOREIGN KEY ("editalId") REFERENCES "Edital"("jobId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropColumn: colunas que passaram para "Edital"
ALTER TABLE "Job" DROP COLUMN "subscriptionUntil";
ALTER TABLE "Job" DROP COLUMN "validUntil";

-- "Sends" e "UserSubscriptions" não precisam de nada: as FKs seguem a tabela
-- renomeada automaticamente e os nomes já batem com o padrão <tabela>_<coluna>_fkey.
