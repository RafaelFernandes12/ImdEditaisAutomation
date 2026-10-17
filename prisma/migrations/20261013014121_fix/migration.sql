-- CreateEnum
CREATE TYPE "ModeloTrabalho" AS ENUM ('PRESENCIAL', 'HIBRIDO', 'REMOTO');

-- CreateEnum
CREATE TYPE "Senioridade" AS ENUM ('ESTAGIO', 'TRAINEE', 'JUNIOR', 'PLENO', 'SENIOR', 'TECHLEAD');

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" SERIAL NOT NULL,
    "key_words" TEXT NOT NULL DEFAULT '',
    "modelo" "ModeloTrabalho"[] DEFAULT ARRAY[]::"ModeloTrabalho"[],
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "senioridade" "Senioridade"[],
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
