-- CON-45: exclusion is one mechanism, not two. A day excluded at upload
-- review or later before a report generates rides the existing
-- excluded_at/excluded_by_id/excluded_reason columns, which every billing
-- read path already honors — so these two never-used columns go before
-- anything reads them.
ALTER TABLE "meter_readings" DROP COLUMN "baseline_included";
ALTER TABLE "meter_readings" DROP COLUMN "baseline_excluded_reason";
