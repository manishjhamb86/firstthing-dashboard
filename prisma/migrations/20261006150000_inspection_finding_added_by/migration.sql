-- AlterTable: add nullable first so existing rows can be backfilled.
ALTER TABLE "inspection_findings" ADD COLUMN "added_at" TIMESTAMP(3);
ALTER TABLE "inspection_findings" ADD COLUMN "added_by_id" TEXT;

-- Backfill: every finding that predates this column was entered as part of
-- the single batch submit the old flow used, so its parent inspection's own
-- creator/createdAt is a true, not a guessed, answer to "who added this and
-- when" for that era.
UPDATE "inspection_findings" f
SET "added_by_id" = i."created_by_id",
    "added_at" = i."created_at"
FROM "inspections" i
WHERE f."inspection_id" = i."id" AND f."added_by_id" IS NULL;

-- Now required, with a real-time default for every future row.
ALTER TABLE "inspection_findings" ALTER COLUMN "added_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "inspection_findings" ALTER COLUMN "added_at" SET NOT NULL;
ALTER TABLE "inspection_findings" ALTER COLUMN "added_by_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "inspection_findings" ADD CONSTRAINT "inspection_findings_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
