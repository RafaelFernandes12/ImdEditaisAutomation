-- AlterTable
CREATE SEQUENCE aichat_id_seq;
ALTER TABLE "AiChat" ALTER COLUMN "id" SET DEFAULT nextval('aichat_id_seq');
ALTER SEQUENCE aichat_id_seq OWNED BY "AiChat"."id";
