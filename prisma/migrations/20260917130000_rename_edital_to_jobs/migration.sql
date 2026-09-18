-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('IMD', 'JERIMUM', 'STI');

-- AlterEnum (StatusEdital -> StatusJob)
ALTER TYPE "StatusEdital" RENAME TO "StatusJob";

-- RenameTable
ALTER TABLE "Edital" RENAME TO "Jobs";
ALTER TABLE "Jobs" RENAME CONSTRAINT "Edital_pkey" TO "Jobs_pkey";
ALTER INDEX "Edital_title_key" RENAME TO "Jobs_title_key";
ALTER INDEX "Edital_link_key" RENAME TO "Jobs_link_key";
ALTER SEQUENCE "Edital_id_seq" RENAME TO "Jobs_id_seq";

-- AlterTable: type deduzido da origem do link (IMD = metropoledigital, JERIMUM = jerimumjobs)
ALTER TABLE "Jobs" ADD COLUMN "type" "JobType";
UPDATE "Jobs" SET "type" = CASE
  WHEN "link" LIKE '%jerimumjobs%' THEN 'JERIMUM'::"JobType"
  ELSE 'IMD'::"JobType"
END;
ALTER TABLE "Jobs" ALTER COLUMN "type" SET NOT NULL;

-- RenameColumn: Pdf.editalId -> Pdf.jobId
ALTER TABLE "Pdf" RENAME COLUMN "editalId" TO "jobId";
ALTER TABLE "Pdf" RENAME CONSTRAINT "Pdf_editalId_fkey" TO "Pdf_jobId_fkey";

-- RenameColumn: Sends.editalId -> Sends.jobId
ALTER TABLE "Sends" RENAME COLUMN "editalId" TO "jobId";
ALTER TABLE "Sends" RENAME CONSTRAINT "Sends_editalId_fkey" TO "Sends_jobId_fkey";

-- RenameColumn: UserSubscriptions.editalId -> UserSubscriptions.jobId
ALTER TABLE "UserSubscriptions" RENAME COLUMN "editalId" TO "jobId";
ALTER TABLE "UserSubscriptions" RENAME CONSTRAINT "UserSubscriptions_editalId_fkey" TO "UserSubscriptions_jobId_fkey";
