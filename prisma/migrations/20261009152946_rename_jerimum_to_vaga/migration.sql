-- Renomeia em vez de recriar, para não perder as vagas já gravadas.
ALTER TABLE "Jerimum" RENAME TO "Vaga";
ALTER TABLE "Vaga" RENAME CONSTRAINT "Jerimum_pkey" TO "Vaga_pkey";
ALTER TABLE "Vaga" RENAME CONSTRAINT "Jerimum_jobId_fkey" TO "Vaga_jobId_fkey";
