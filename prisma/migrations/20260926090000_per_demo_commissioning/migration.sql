-- CreateEnum
CREATE TYPE "demo_combine" AS ENUM ('batch', 'rerun');

-- CreateEnum
CREATE TYPE "demo_origin" AS ENUM ('app', 'migrated');

-- CreateEnum
CREATE TYPE "demo_reading_source" AS ENUM ('meter', 'manual', 'demo_generated', 'migrated');

-- CreateEnum
CREATE TYPE "reading_origin" AS ENUM ('meter', 'monthly_upload', 'legacy');

-- AlterEnum
ALTER TYPE "job_type" ADD VALUE 'demo_relock_sweep';

-- AlterTable
ALTER TABLE "circuit_demo_readings" ADD COLUMN     "data_hours" INTEGER,
ADD COLUMN     "edited_by_id" TEXT,
ADD COLUMN     "excluded_at" TIMESTAMP(3),
ADD COLUMN     "excluded_by_id" TEXT,
ADD COLUMN     "excluded_reason" TEXT,
ADD COLUMN     "hours_covered" INTEGER,
ADD COLUMN     "meter_id" TEXT,
ADD COLUMN     "meter_kwh" DOUBLE PRECISION,
ADD COLUMN     "raw_file_id" TEXT,
ADD COLUMN     "source" "demo_reading_source" NOT NULL DEFAULT 'meter',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "circuit_demos" ADD COLUMN     "combine" "demo_combine" NOT NULL DEFAULT 'rerun',
ADD COLUMN     "light_replacement_date" TIMESTAMP(3),
ADD COLUMN     "load_discrepancy_pct" DOUBLE PRECISION,
ADD COLUMN     "load_validation_override_by_id" TEXT,
ADD COLUMN     "load_validation_override_reason" TEXT,
ADD COLUMN     "meter_displayed_load" DOUBLE PRECISION,
ADD COLUMN     "meter_id" TEXT,
ADD COLUMN     "meter_installation_id" TEXT,
ADD COLUMN     "meter_installed_at" TIMESTAMP(3),
ADD COLUMN     "meter_skipped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" "demo_origin" NOT NULL DEFAULT 'app',
ADD COLUMN     "post_from" TIMESTAMP(3),
ADD COLUMN     "post_to" TIMESTAMP(3),
ADD COLUMN     "pre_from" TIMESTAMP(3),
ADD COLUMN     "pre_to" TIMESTAMP(3),
ADD COLUMN     "replacement_assigned_at" TIMESTAMP(3),
ADD COLUMN     "replacement_assigned_by_id" TEXT,
ADD COLUMN     "replacement_owner_id" TEXT,
ADD COLUMN     "unlock_reason" TEXT,
ADD COLUMN     "unlocked_by_id" TEXT,
ADD COLUMN     "unlocked_until" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by_id" TEXT,
ALTER COLUMN "pre_install_baseline" DROP NOT NULL,
ALTER COLUMN "post_install_average" DROP NOT NULL,
ALTER COLUMN "savings_pct" DROP NOT NULL;

-- AlterTable
ALTER TABLE "demo_reports" ADD COLUMN     "demo_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "demo_result_reviews" ADD COLUMN     "demo_id" TEXT;

-- AlterTable
ALTER TABLE "gate_passes" ADD COLUMN     "demo_id" TEXT;

-- AlterTable
ALTER TABLE "meter_readings" ADD COLUMN     "data_hours" INTEGER,
ADD COLUMN     "origin" "reading_origin" NOT NULL DEFAULT 'legacy',
ADD COLUMN     "other_kwh" DOUBLE PRECISION,
ADD COLUMN     "other_origin" "reading_origin",
ADD COLUMN     "other_raw_file_id" TEXT;

-- AlterTable
ALTER TABLE "scheduled_events" ADD COLUMN     "demo_id" TEXT;

-- CreateTable
CREATE TABLE "circuit_demo_acceptances" (
    "id" TEXT NOT NULL,
    "demo_id" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "days" JSONB NOT NULL,
    "average_kwh" DOUBLE PRECISION,
    "counted_days" INTEGER NOT NULL,
    "accepted_by_id" TEXT,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circuit_demo_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_log" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "circuit_id" TEXT,
    "demo_id" TEXT,
    "meter_id" TEXT,
    "kind" TEXT NOT NULL,
    "field" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "actor_id" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "circuit_demo_acceptances_demo_id_phase_version_key" ON "circuit_demo_acceptances"("demo_id", "phase", "version");

-- CreateIndex
CREATE INDEX "change_log_demo_id_at_idx" ON "change_log"("demo_id", "at");

-- CreateIndex
CREATE INDEX "change_log_circuit_id_at_idx" ON "change_log"("circuit_id", "at");

-- CreateIndex
CREATE INDEX "change_log_meter_id_at_idx" ON "change_log"("meter_id", "at");

-- CreateIndex
CREATE INDEX "gate_passes_demo_id_idx" ON "gate_passes"("demo_id");

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "circuit_demos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "circuit_demos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_demos" ADD CONSTRAINT "circuit_demos_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meter_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_demos" ADD CONSTRAINT "circuit_demos_replacement_owner_id_fkey" FOREIGN KEY ("replacement_owner_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_demos" ADD CONSTRAINT "circuit_demos_replacement_assigned_by_id_fkey" FOREIGN KEY ("replacement_assigned_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_demos" ADD CONSTRAINT "circuit_demos_unlocked_by_id_fkey" FOREIGN KEY ("unlocked_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_demo_acceptances" ADD CONSTRAINT "circuit_demo_acceptances_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "circuit_demos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_demo_acceptances" ADD CONSTRAINT "circuit_demo_acceptances_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_result_reviews" ADD CONSTRAINT "demo_result_reviews_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "circuit_demos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

