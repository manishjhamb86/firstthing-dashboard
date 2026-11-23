-- One name per circuit, shown everywhere (2026-11-23, user-asked).
ALTER TABLE "circuits" ADD COLUMN "name" TEXT;

-- Where the deal has exactly one live circuit and a name of its own, the
-- circuit takes the deal's name (the user's call: the deal name everywhere).
UPDATE "circuits" c
SET "name" = btrim(p."deal_scope")
FROM "site_surveys" s
JOIN "pipelines" p ON p."id" = s."pipeline_id"
WHERE c."site_survey_id" = s."id"
  AND c."voided_at" IS NULL
  AND coalesce(btrim(p."deal_scope"), '') <> ''
  AND (SELECT count(*) FROM "circuits" c2 WHERE c2."site_survey_id" = s."id" AND c2."voided_at" IS NULL) = 1;

-- Everything else keeps the label it showed before: location · light type,
-- collapsed when one already contains the other.
UPDATE "circuits"
SET "name" = CASE
  WHEN coalesce(btrim("location"), '') = '' THEN btrim("light_type")
  WHEN position(lower(btrim("location")) in lower(btrim("light_type"))) > 0 THEN btrim("light_type")
  WHEN position(lower(btrim("light_type")) in lower(btrim("location"))) > 0 THEN btrim("location")
  ELSE btrim("location") || ' · ' || btrim("light_type")
END
WHERE "name" IS NULL;

ALTER TABLE "circuits" ALTER COLUMN "name" SET NOT NULL;
