-- CON-24 amendment (2026-08-31): a service line is delivered in parts, so a
-- Pipeline is one DEAL per (society, serviceLine, scope) rather than one per
-- line. The unique constraint goes; the per-line rules (solar/wastewater one
-- open deal, duplicate-scope refusal) are application checks in deal-scope.ts.
ALTER TABLE "pipelines" ADD COLUMN "deal_scope" TEXT;

DROP INDEX "pipelines_society_id_service_line_key";

CREATE INDEX "pipelines_society_id_service_line_idx" ON "pipelines"("society_id", "service_line");
