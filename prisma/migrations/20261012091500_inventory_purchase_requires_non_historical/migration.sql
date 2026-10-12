-- A batch with no supplier invoice is only ever a historical one
-- (2026-10-12, user-asked, after reviewing the prior migration's own
-- `purchase_id` DROP NOT NULL): the nullability alone did not say WHEN
-- null is legitimate, so a bug in some future write path could silently
-- create an ordinary delivery with no invoice behind it. Enforced in the
-- database, not just in receiveHistoricalStock's own code, for the same
-- reason meter_alerts_one_subject is a CHECK and not an application rule.
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_purchase_requires_non_historical"
  CHECK ("historical" = true OR "purchase_id" IS NOT NULL);
