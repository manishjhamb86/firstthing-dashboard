
-- CreateEnum
CREATE TYPE "commissioning_window_type" AS ENUM ('pre_install', 'post_install');

-- CreateEnum
CREATE TYPE "commissioning_reading_status" AS ENUM ('valid', 'anomaly');

-- AlterEnum
BEGIN;
CREATE TYPE "circuit_state_new" AS ENUM ('surveyed', 'eligible', 'ineligible', 'meter_installed', 'pre_install_monitoring', 'awaiting_installation', 'post_install_pending', 'post_install_monitoring', 'benchmark_confirmed', 'benchmark_review', 'active_billing', 'retired');
ALTER TABLE "public"."circuits" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "circuits" ALTER COLUMN "state" TYPE "circuit_state_new" USING ("state"::text::"circuit_state_new");
ALTER TYPE "circuit_state" RENAME TO "circuit_state_old";
ALTER TYPE "circuit_state_new" RENAME TO "circuit_state";
DROP TYPE "public"."circuit_state_old";
ALTER TABLE "circuits" ALTER COLUMN "state" SET DEFAULT 'surveyed';
COMMIT;

-- AlterEnum
ALTER TYPE "gate_pass_kind" ADD VALUE 'demo_install_completion';

-- AlterTable
ALTER TABLE "circuits" ADD COLUMN     "benchmark_savings_pct" DOUBLE PRECISION,
ADD COLUMN     "light_replacement_date" TIMESTAMP(3),
ADD COLUMN     "post_install_baseline" DOUBLE PRECISION,
ADD COLUMN     "post_install_window_start_at" TIMESTAMP(3),
ADD COLUMN     "pre_install_baseline" DOUBLE PRECISION,
ADD COLUMN     "pre_install_window_start_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "commissioning_readings" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "window_type" "commissioning_window_type" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "consumption_kwh" DOUBLE PRECISION,
    "status" "commissioning_reading_status" NOT NULL,
    "anomaly_note" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commissioning_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commissioning_readings_circuit_id_window_type_idx" ON "commissioning_readings"("circuit_id", "window_type");

-- CreateIndex
CREATE UNIQUE INDEX "commissioning_readings_circuit_id_window_type_date_key" ON "commissioning_readings"("circuit_id", "window_type", "date");

-- AddForeignKey
ALTER TABLE "commissioning_readings" ADD CONSTRAINT "commissioning_readings_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_readings" ADD CONSTRAINT "commissioning_readings_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

