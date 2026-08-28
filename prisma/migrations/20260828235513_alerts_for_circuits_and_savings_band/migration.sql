-- AlterEnum
ALTER TYPE "MeterAlertKind" ADD VALUE 'savings_out_of_band';

-- AlterTable
ALTER TABLE "meter_alerts" ADD COLUMN     "circuit_id" TEXT,
ADD COLUMN     "raise_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "reraised_at" TIMESTAMP(3),
ALTER COLUMN "meter_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "meter_alerts_circuit_id_opened_at_idx" ON "meter_alerts"("circuit_id", "opened_at");

-- AddForeignKey
ALTER TABLE "meter_alerts" ADD CONSTRAINT "meter_alerts_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The same one-open-alert guarantee as meters, for circuit-scoped alerts.
-- A partial unique index, not an application check: the hourly sweep and an
-- import can evaluate the same circuit at once.
CREATE UNIQUE INDEX "meter_alerts_open_circuit_unique"
  ON "meter_alerts" ("circuit_id", "kind")
  WHERE "closed_at" IS NULL AND "circuit_id" IS NOT NULL;

-- Exactly one subject, always.
ALTER TABLE "meter_alerts" ADD CONSTRAINT "meter_alerts_one_subject"
  CHECK (("meter_id" IS NULL) <> ("circuit_id" IS NULL));
