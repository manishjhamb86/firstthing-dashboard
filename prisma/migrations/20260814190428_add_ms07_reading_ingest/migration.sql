-- CreateEnum
CREATE TYPE "reading_source" AS ENUM ('csv', 'api');

-- CreateEnum
CREATE TYPE "reading_upload_status" AS ENUM ('pending_normalization', 'awaiting_mapping', 'ready', 'committed', 'abandoned', 'superseded');

-- CreateEnum
CREATE TYPE "reading_anomaly_kind" AS ENUM ('zero_reading', 'out_of_range', 'day_over_day_jump', 'missing_days');

-- CreateEnum
CREATE TYPE "reading_anomaly_status" AS ENUM ('open', 'accepted', 'excluded', 'sent_back');

-- CreateTable
CREATE TABLE "raw_reading_files" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "vendor" TEXT,
    "status" "reading_upload_status" NOT NULL DEFAULT 'pending_normalization',
    "proposed_mapping" JSONB,
    "confirmed_mapping" JSONB,
    "clarifications" JSONB,
    "ai_confidence" TEXT,
    "ai_error" TEXT,
    "mapping_overridden" BOOLEAN NOT NULL DEFAULT false,
    "rows_parsed" INTEGER,
    "days_produced" INTEGER,
    "superseded_by_id" TEXT,
    "superseded_at" TIMESTAMP(3),
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_reading_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kwh" DOUBLE PRECISION NOT NULL,
    "source" "reading_source" NOT NULL,
    "interval_count" INTEGER,
    "validity_flag" BOOLEAN NOT NULL DEFAULT true,
    "anomaly_flag" BOOLEAN NOT NULL DEFAULT false,
    "excluded_at" TIMESTAMP(3),
    "excluded_by_id" TEXT,
    "excluded_reason" TEXT,
    "superseded_value" DOUBLE PRECISION,
    "superseded_at" TIMESTAMP(3),
    "superseded_by_user_id" TEXT,
    "used_in_calculation_id" TEXT,
    "raw_file_id" TEXT NOT NULL,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_anomalies" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "kind" "reading_anomaly_kind" NOT NULL,
    "detail" TEXT NOT NULL,
    "observed_value" DOUBLE PRECISION,
    "expected_value" DOUBLE PRECISION,
    "deviation_pct" DOUBLE PRECISION,
    "blocks_billing" BOOLEAN NOT NULL DEFAULT true,
    "status" "reading_anomaly_status" NOT NULL DEFAULT 'open',
    "resolution_reason" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "raw_file_id" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coverage_acceptances" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "coverage_days" INTEGER NOT NULL,
    "days_in_month" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "accepted_by_id" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coverage_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "raw_reading_files_superseded_by_id_key" ON "raw_reading_files"("superseded_by_id");

-- CreateIndex
CREATE INDEX "raw_reading_files_circuit_id_period_idx" ON "raw_reading_files"("circuit_id", "period");

-- CreateIndex
CREATE INDEX "meter_readings_circuit_id_date_idx" ON "meter_readings"("circuit_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "meter_readings_circuit_id_date_source_key" ON "meter_readings"("circuit_id", "date", "source");

-- CreateIndex
CREATE INDEX "reading_anomalies_circuit_id_period_idx" ON "reading_anomalies"("circuit_id", "period");

-- CreateIndex
CREATE INDEX "reading_anomalies_status_idx" ON "reading_anomalies"("status");

-- CreateIndex
CREATE UNIQUE INDEX "coverage_acceptances_circuit_id_period_key" ON "coverage_acceptances"("circuit_id", "period");

-- AddForeignKey
ALTER TABLE "raw_reading_files" ADD CONSTRAINT "raw_reading_files_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_reading_files" ADD CONSTRAINT "raw_reading_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_reading_files" ADD CONSTRAINT "raw_reading_files_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "raw_reading_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_raw_file_id_fkey" FOREIGN KEY ("raw_file_id") REFERENCES "raw_reading_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_anomalies" ADD CONSTRAINT "reading_anomalies_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_anomalies" ADD CONSTRAINT "reading_anomalies_raw_file_id_fkey" FOREIGN KEY ("raw_file_id") REFERENCES "raw_reading_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_anomalies" ADD CONSTRAINT "reading_anomalies_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_acceptances" ADD CONSTRAINT "coverage_acceptances_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_acceptances" ADD CONSTRAINT "coverage_acceptances_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
