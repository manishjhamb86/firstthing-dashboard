-- A society is never entered twice. Added nullable first so existing rows can
-- be backfilled with the same normalisation the application uses, then made
-- unique and NOT NULL — adding it NOT NULL up front would fail on any table
-- that already has rows.
ALTER TABLE "societies" ADD COLUMN "dedupe_key" TEXT;

UPDATE "societies"
SET "dedupe_key" =
  trim(regexp_replace(lower("name"), '[^a-z0-9]+', ' ', 'g'))
  || '|' ||
  trim(regexp_replace(lower("location"), '[^a-z0-9]+', ' ', 'g'));

-- Fails loudly if the table already holds duplicates, which is the correct
-- outcome: they have to be merged by a person, not silently collapsed here.
CREATE UNIQUE INDEX "societies_dedupe_key_key" ON "societies"("dedupe_key");

ALTER TABLE "societies" ALTER COLUMN "dedupe_key" SET NOT NULL;
