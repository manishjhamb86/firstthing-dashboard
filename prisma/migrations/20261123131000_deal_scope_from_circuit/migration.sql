-- A deal with no name of its own takes its single circuit's name, so the deal
-- header, the society page, the survey and the circuit read the same
-- (2026-11-23, user-asked). Never onto a name another deal of the same line
-- at the society already uses.
UPDATE "pipelines" p
SET "deal_scope" = c."name"
FROM "site_surveys" s
JOIN "circuits" c ON c."site_survey_id" = s."id" AND c."voided_at" IS NULL
WHERE s."pipeline_id" = p."id"
  AND coalesce(btrim(p."deal_scope"), '') = ''
  AND (SELECT count(*) FROM "circuits" c2 WHERE c2."site_survey_id" = s."id" AND c2."voided_at" IS NULL) = 1
  AND NOT EXISTS (
    SELECT 1 FROM "pipelines" o
    WHERE o."society_id" = p."society_id" AND o."service_line" = p."service_line" AND o."id" <> p."id"
      AND lower(btrim(o."deal_scope")) = lower(btrim(c."name"))
  );
