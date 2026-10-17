-- Coloca todo o banco em snake_case. Só renomeia (tabelas, colunas, enums,
-- constraints, índices e sequences), para não perder nenhum dado.
-- Os nomes dos models e campos no Prisma continuam em camelCase via @map/@@map.

-- Enums
ALTER TYPE "StatusJob" RENAME TO "status_job";
ALTER TYPE "JobType" RENAME TO "job_type";
ALTER TYPE "PdfTipo" RENAME TO "pdf_tipo";

-- Job
ALTER TABLE "Job" RENAME TO "job";
ALTER TABLE "job" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "job" RENAME COLUMN "finishedAt" TO "finished_at";
ALTER TABLE "job" RENAME COLUMN "keyWords" TO "key_words";
ALTER TABLE "job" RENAME CONSTRAINT "Job_pkey" TO "job_pkey";
ALTER INDEX "Job_title_key" RENAME TO "job_title_key";
ALTER INDEX "Job_link_key" RENAME TO "job_link_key";
ALTER SEQUENCE "Job_id_seq" RENAME TO "job_id_seq";

-- Edital
ALTER TABLE "Edital" RENAME TO "edital";
ALTER TABLE "edital" RENAME COLUMN "jobId" TO "job_id";
ALTER TABLE "edital" RENAME COLUMN "subscriptionUntil" TO "subscription_until";
ALTER TABLE "edital" RENAME COLUMN "validUntil" TO "valid_until";
ALTER TABLE "edital" RENAME CONSTRAINT "Edital_pkey" TO "edital_pkey";
ALTER TABLE "edital" RENAME CONSTRAINT "Edital_jobId_fkey" TO "edital_job_id_fkey";

-- Vaga
ALTER TABLE "Vaga" RENAME TO "vaga";
ALTER TABLE "vaga" RENAME COLUMN "jobId" TO "job_id";
ALTER TABLE "vaga" RENAME CONSTRAINT "Vaga_pkey" TO "vaga_pkey";
ALTER TABLE "vaga" RENAME CONSTRAINT "Vaga_jobId_fkey" TO "vaga_job_id_fkey";

-- Pdf
ALTER TABLE "Pdf" RENAME TO "pdf";
ALTER TABLE "pdf" RENAME COLUMN "editalId" TO "edital_id";
ALTER TABLE "pdf" RENAME CONSTRAINT "Pdf_pkey" TO "pdf_pkey";
ALTER TABLE "pdf" RENAME CONSTRAINT "Pdf_editalId_fkey" TO "pdf_edital_id_fkey";
ALTER INDEX "Pdf_link_key" RENAME TO "pdf_link_key";
ALTER SEQUENCE "Pdf_id_seq" RENAME TO "pdf_id_seq";

-- User
ALTER TABLE "User" RENAME TO "user";
ALTER TABLE "user" RENAME COLUMN "chatId" TO "chat_id";
ALTER TABLE "user" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "user" RENAME COLUMN "keyWords" TO "key_words";
ALTER TABLE "user" RENAME CONSTRAINT "User_pkey" TO "user_pkey";
ALTER INDEX "User_chatId_key" RENAME TO "user_chat_id_key";
ALTER INDEX "User_contact_key" RENAME TO "user_contact_key";
ALTER SEQUENCE "User_id_seq" RENAME TO "user_id_seq";

-- UserSubscriptions
ALTER TABLE "UserSubscriptions" RENAME TO "user_subscriptions";
ALTER TABLE "user_subscriptions" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "user_subscriptions" RENAME COLUMN "jobId" TO "job_id";
ALTER TABLE "user_subscriptions" RENAME CONSTRAINT "UserSubscriptions_pkey" TO "user_subscriptions_pkey";
ALTER TABLE "user_subscriptions" RENAME CONSTRAINT "UserSubscriptions_userId_fkey" TO "user_subscriptions_user_id_fkey";
ALTER TABLE "user_subscriptions" RENAME CONSTRAINT "UserSubscriptions_jobId_fkey" TO "user_subscriptions_job_id_fkey";
ALTER SEQUENCE "UserSubscriptions_id_seq" RENAME TO "user_subscriptions_id_seq";

-- Sends
ALTER TABLE "Sends" RENAME TO "sends";
ALTER TABLE "sends" RENAME COLUMN "pdfId" TO "pdf_id";
ALTER TABLE "sends" RENAME COLUMN "jobId" TO "job_id";
ALTER TABLE "sends" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "sends" RENAME CONSTRAINT "Sends_pkey" TO "sends_pkey";
ALTER TABLE "sends" RENAME CONSTRAINT "Sends_pdfId_fkey" TO "sends_pdf_id_fkey";
ALTER TABLE "sends" RENAME CONSTRAINT "Sends_jobId_fkey" TO "sends_job_id_fkey";
ALTER TABLE "sends" RENAME CONSTRAINT "Sends_userId_fkey" TO "sends_user_id_fkey";
ALTER INDEX "Sends_userId_jobId_pdfId_key" RENAME TO "sends_user_id_job_id_pdf_id_key";
ALTER SEQUENCE "Sends_id_seq" RENAME TO "sends_id_seq";

-- Reminders
ALTER TABLE "Reminders" RENAME TO "reminders";
ALTER TABLE "reminders" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "reminders" RENAME CONSTRAINT "Reminders_pkey" TO "reminders_pkey";
ALTER TABLE "reminders" RENAME CONSTRAINT "Reminders_userId_fkey" TO "reminders_user_id_fkey";
ALTER SEQUENCE "Reminders_id_seq" RENAME TO "reminders_id_seq";
