-- CreateEnum
CREATE TYPE "gate_pass_kind" AS ENUM ('demo_install');

-- CreateEnum
CREATE TYPE "gate_pass_status" AS ENUM ('submitted', 'provisional', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "job_type" AS ENUM ('gatepass_sweep');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('pending', 'running', 'done', 'failed');

-- AlterEnum
ALTER TYPE "circuit_state" ADD VALUE 'meter_installed';

-- AlterTable
ALTER TABLE "circuits" ADD COLUMN     "load_discrepancy_pct" DOUBLE PRECISION,
ADD COLUMN     "load_validation_override_by_id" TEXT,
ADD COLUMN     "load_validation_override_reason" TEXT,
ADD COLUMN     "meter_displayed_load" DOUBLE PRECISION,
ADD COLUMN     "meter_installed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" "job_type" NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_passes" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "kind" "gate_pass_kind" NOT NULL,
    "status" "gate_pass_status" NOT NULL DEFAULT 'submitted',
    "items_json" JSONB NOT NULL,
    "photo_url" TEXT,
    "submitted_by_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,

    CONSTRAINT "gate_passes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_status_run_at_idx" ON "jobs"("status", "run_at");

-- CreateIndex
CREATE INDEX "gate_passes_circuit_id_idx" ON "gate_passes"("circuit_id");

-- CreateIndex
CREATE INDEX "gate_passes_status_idx" ON "gate_passes"("status");

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_load_validation_override_by_id_fkey" FOREIGN KEY ("load_validation_override_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
