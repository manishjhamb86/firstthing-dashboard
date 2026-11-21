-- A gate pass is dated to the minute, not filed under a month (2026-11-21,
-- user-asked): several are issued in one month, sometimes several in a day,
-- and each is its own document. `issued_at` is the date and time printed on
-- the pass, typed by the operator (wall clock, stored UTC-read like every
-- person-typed time here). Its slot is (society, type, issued_at); every
-- other type keeps its (society, type, period) slot. A plain unique index
-- cannot hold both, so the old one becomes two partial ones — the same shape
-- as `meter_alerts_open_unique`.
ALTER TABLE "stored_documents" ADD COLUMN "issued_at" TIMESTAMP(3);

DROP INDEX "stored_documents_society_id_doc_type_period_version_key";

CREATE UNIQUE INDEX "stored_documents_period_slot_version_key"
  ON "stored_documents"("society_id", "doc_type", "period", "version")
  WHERE "issued_at" IS NULL;

CREATE UNIQUE INDEX "stored_documents_issued_slot_version_key"
  ON "stored_documents"("society_id", "doc_type", "issued_at", "version")
  WHERE "issued_at" IS NOT NULL;
