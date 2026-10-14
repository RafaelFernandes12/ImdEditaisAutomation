-- O summary de um job com vários perfis (ex.: edital) junta as vagas com uma
-- linha em branco antes de cada "*Vaga:*" (formatJobSummary). A migration
-- anterior criou uma vaga por job; aqui cada bloco vira a sua própria vaga.
-- key_words sai da linha "*Palavras-chaves:*" do bloco (se o bloco não tiver,
-- fica com as keywords do job inteiro); os outros campos eram do job inteiro e
-- são copiados para todas as vagas dele.

-- Blocos 2..n viram vagas novas (precisa vir antes do UPDATE, que corta o summary).
INSERT INTO "vaga" ("summary", "key_words", "ecossytem", "salary", "formato", "city", "state", "modelo", "senioridade", "job_id")
SELECT
  b."bloco",
  COALESCE(btrim(substring(b."bloco" from '\*Palavras-chaves:\* ([^\n]*)')), v."key_words"),
  v."ecossytem", v."salary", v."formato", v."city", v."state", v."modelo", v."senioridade", v."job_id"
FROM "vaga" v
CROSS JOIN LATERAL regexp_split_to_table(v."summary", '\n\n(?=\*Vaga:\*)') WITH ORDINALITY AS b("bloco", "ord")
WHERE v."summary" ~ '\n\n\*Vaga:\*' AND b."ord" > 1
ORDER BY v."id", b."ord";

-- A vaga original fica com o primeiro bloco.
UPDATE "vaga" v SET
  "summary" = b."primeiro",
  "key_words" = COALESCE(btrim(substring(b."primeiro" from '\*Palavras-chaves:\* ([^\n]*)')), v."key_words")
FROM (
  SELECT "id", (regexp_split_to_array("summary", '\n\n(?=\*Vaga:\*)'))[1] AS "primeiro"
  FROM "vaga"
  WHERE "summary" ~ '\n\n\*Vaga:\*'
) b
WHERE v."id" = b."id";
