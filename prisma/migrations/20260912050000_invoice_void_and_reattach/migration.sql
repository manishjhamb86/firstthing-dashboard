-- A wrongly attached invoice can now be voided and reattached (2026-09-12,
-- user-asked). The plain unique constraint on monthly_calculation_id is
-- dropped in favour of a partial one covering only LIVE rows, the same
-- shape as meter_alerts_open_unique: a voided row keeps the calculation's
-- (society, period) history intact while freeing the slot for a fresh
-- attach. Nothing is billed yet (the feature deployed hours before this),
-- so there is no live invoice this could conflict with.

-- DropIndex
DROP INDEX "billing_invoices_monthly_calculation_id_key";

-- AlterTable
ALTER TABLE "billing_invoices"
  ADD COLUMN "voided_at" TIMESTAMP(3),
  ADD COLUMN "voided_by_id" TEXT,
  ADD COLUMN "void_reason" TEXT;

-- CreateIndex
CREATE INDEX "billing_invoices_monthly_calculation_id_idx" ON "billing_invoices"("monthly_calculation_id");

-- CreateIndex — at most one LIVE invoice per calculation, enforced at the
-- database level rather than by an application check a race could beat.
CREATE UNIQUE INDEX "billing_invoices_live_calculation_unique" ON "billing_invoices"("monthly_calculation_id") WHERE "voided_at" IS NULL;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
