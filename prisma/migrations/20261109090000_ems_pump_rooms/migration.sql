-- CreateEnum
CREATE TYPE "pump_room_kind" AS ENUM ('domestic', 'stp', 'fire');

-- CreateEnum
CREATE TYPE "ems_pump_ingest_status" AS ENUM ('needs_assignment', 'applied', 'parse_failed');

-- AlterEnum
ALTER TYPE "job_type" ADD VALUE 'pump_room_email_sweep';

-- CreateTable
CREATE TABLE "google_gmail_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "client_email" TEXT NOT NULL,
    "private_key" TEXT NOT NULL,
    "mailbox" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_ok_at" TIMESTAMP(3),
    "last_error" TEXT,
    "last_sweep_at" TIMESTAMP(3),
    "last_sweep_summary" TEXT,

    CONSTRAINT "google_gmail_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ems_pump_meters" (
    "id" TEXT NOT NULL,
    "vendor_subject_label" TEXT NOT NULL,
    "room_type" "pump_room_kind",
    "society_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "assigned_by_id" TEXT,
    "last_kwh" DOUBLE PRECISION,
    "last_total_flow" DOUBLE PRECISION,
    "last_reading_at" TIMESTAMP(3),
    "last_ingest_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ems_pump_meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ems_pump_email_ingests" (
    "id" TEXT NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "gmail_thread_id" TEXT,
    "subject_label" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "pump_meter_id" TEXT,
    "s3_key" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "row_count" INTEGER,
    "status" "ems_pump_ingest_status" NOT NULL DEFAULT 'needs_assignment',
    "parse_error" TEXT,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ems_pump_email_ingests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ems_pump_readings" (
    "id" TEXT NOT NULL,
    "pump_meter_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "last_kwh" DOUBLE PRECISION NOT NULL,
    "last_total_flow" DOUBLE PRECISION,
    "last_ts" TIMESTAMP(3) NOT NULL,
    "daily_kwh" DOUBLE PRECISION,
    "register_went_backwards" BOOLEAN NOT NULL DEFAULT false,
    "source_ingest_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ems_pump_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ems_pump_meters_vendor_subject_label_key" ON "ems_pump_meters"("vendor_subject_label");

-- CreateIndex
CREATE INDEX "ems_pump_meters_society_id_idx" ON "ems_pump_meters"("society_id");

-- CreateIndex
CREATE UNIQUE INDEX "ems_pump_email_ingests_gmail_message_id_key" ON "ems_pump_email_ingests"("gmail_message_id");

-- CreateIndex
CREATE INDEX "ems_pump_email_ingests_pump_meter_id_status_idx" ON "ems_pump_email_ingests"("pump_meter_id", "status");

-- CreateIndex
CREATE INDEX "ems_pump_email_ingests_status_received_at_idx" ON "ems_pump_email_ingests"("status", "received_at");

-- CreateIndex
CREATE INDEX "ems_pump_readings_pump_meter_id_date_idx" ON "ems_pump_readings"("pump_meter_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ems_pump_readings_pump_meter_id_date_key" ON "ems_pump_readings"("pump_meter_id", "date");

-- AddForeignKey
ALTER TABLE "google_gmail_config" ADD CONSTRAINT "google_gmail_config_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ems_pump_meters" ADD CONSTRAINT "ems_pump_meters_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ems_pump_meters" ADD CONSTRAINT "ems_pump_meters_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ems_pump_email_ingests" ADD CONSTRAINT "ems_pump_email_ingests_pump_meter_id_fkey" FOREIGN KEY ("pump_meter_id") REFERENCES "ems_pump_meters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ems_pump_readings" ADD CONSTRAINT "ems_pump_readings_pump_meter_id_fkey" FOREIGN KEY ("pump_meter_id") REFERENCES "ems_pump_meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ems_pump_readings" ADD CONSTRAINT "ems_pump_readings_source_ingest_id_fkey" FOREIGN KEY ("source_ingest_id") REFERENCES "ems_pump_email_ingests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

