-- Junta badge no title: "<title> - <badge>" (ou só o title, quando o badge é vazio)
UPDATE "Edital"
SET "title" = CASE
  WHEN btrim("badge") = '' THEN btrim("title")
  ELSE btrim("title") || ' - ' || btrim("badge")
END;

-- DropIndex
DROP INDEX "Edital_badge_key";

-- AlterTable
ALTER TABLE "Edital" DROP COLUMN "badge";

-- CreateIndex
CREATE UNIQUE INDEX "Edital_title_key" ON "Edital"("title");
