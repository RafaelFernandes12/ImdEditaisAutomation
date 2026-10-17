-- Remove NAO_INFORMADO do enum Formato: em "job" (formato é nullable) o
-- "não informado" passa a ser NULL.

-- AlterEnum
BEGIN;
CREATE TYPE "Formato_new" AS ENUM ('PRESENCIAL', 'HIBRIDO', 'REMOTO');
ALTER TABLE "job" ALTER COLUMN "formato" TYPE "Formato_new" USING (NULLIF("formato"::text, 'NAO_INFORMADO')::"Formato_new");
ALTER TABLE "user_preferences" ALTER COLUMN "formato" TYPE "Formato_new" USING ("formato"::text::"Formato_new");
ALTER TYPE "Formato" RENAME TO "Formato_old";
ALTER TYPE "Formato_new" RENAME TO "Formato";
DROP TYPE "public"."Formato_old";
COMMIT;
