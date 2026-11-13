-- CreateEnum
CREATE TYPE "ems_pump_reading_origin" AS ENUM ('ems_email', 'report');

-- AlterTable
ALTER TABLE "ems_pump_readings" ADD COLUMN     "origin" "ems_pump_reading_origin" NOT NULL DEFAULT 'ems_email',
ADD COLUMN     "source_document_id" TEXT,
ALTER COLUMN "last_kwh" DROP NOT NULL,
ALTER COLUMN "last_ts" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ems_pump_baselines" (
    "id" TEXT NOT NULL,
    "pump_meter_id" TEXT NOT NULL,
    "period_from" TIMESTAMP(3) NOT NULL,
    "period_to" TIMESTAMP(3) NOT NULL,
    "kwh" DOUBLE PRECISION NOT NULL,
    "kl" DOUBLE PRECISION NOT NULL,
    "kwh_per_kl" DOUBLE PRECISION NOT NULL,
    "savings_from" TIMESTAMP(3) NOT NULL,
    "source_document_id" TEXT,
    "note" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" TEXT NOT NULL,
    "superseded_at" TIMESTAMP(3),
    "superseded_by_id" TEXT,

    CONSTRAINT "ems_pump_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ems_pump_baselines_pump_meter_id_superseded_at_idx" ON "ems_pump_baselines"("pump_meter_id", "superseded_at");

-- AddForeignKey
ALTER TABLE "ems_pump_baselines" ADD CONSTRAINT "ems_pump_baselines_pump_meter_id_fkey" FOREIGN KEY ("pump_meter_id") REFERENCES "ems_pump_meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ems_pump_baselines" ADD CONSTRAINT "ems_pump_baselines_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "stored_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ems_pump_baselines" ADD CONSTRAINT "ems_pump_baselines_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ems_pump_baselines" ADD CONSTRAINT "ems_pump_baselines_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ems_pump_readings" ADD CONSTRAINT "ems_pump_readings_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "stored_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

