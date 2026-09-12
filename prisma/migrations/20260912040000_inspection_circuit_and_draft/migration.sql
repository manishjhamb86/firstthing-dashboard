-- Inspections gain a circuit link (2026-09-12, user-specified) and become a
-- two-stage capture: total_lights_checked is now nullable, meaning "not yet
-- finalised" for any row still in progress. No existing row has a value to
-- lose (the feature deployed only hours earlier with no live inspections
-- filed on stage), so this is safe as a straight ALTER, not a backfill.

-- AlterTable
ALTER TABLE "inspections"
  ADD COLUMN "circuit_id" TEXT,
  ALTER COLUMN "total_lights_checked" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "inspections_circuit_id_idx" ON "inspections"("circuit_id");
