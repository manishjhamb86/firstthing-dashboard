-- Monthly inspection checklist (2026-09-12), digitising the real paper
-- "MOTION SENSOR LIGHT – QUICK INSPECTION CHECKLIST" form the user shared.
-- Purely additive: two new tables, one new enum, no existing table altered.

-- CreateEnum
CREATE TYPE "inspection_sensor_status" AS ENUM ('ok', 'full', 'dim', 'off', 'flicker');

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL,
    "inspected_at" TIMESTAMP(3) NOT NULL,
    "inspector_name" TEXT NOT NULL,
    "inspector_contact" TEXT NOT NULL,
    "total_lights_checked" INTEGER NOT NULL,
    "society_rep_name" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_findings" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "sr_no" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "sensor_status" "inspection_sensor_status" NOT NULL,
    "physical_damage" BOOLEAN NOT NULL DEFAULT false,
    "action_replace" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,

    CONSTRAINT "inspection_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inspections_society_id_area_period_key" ON "inspections"("society_id", "area", "period");

-- CreateIndex
CREATE INDEX "inspections_society_id_idx" ON "inspections"("society_id");

-- CreateIndex
CREATE INDEX "inspection_findings_inspection_id_idx" ON "inspection_findings"("inspection_id");

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_findings" ADD CONSTRAINT "inspection_findings_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
