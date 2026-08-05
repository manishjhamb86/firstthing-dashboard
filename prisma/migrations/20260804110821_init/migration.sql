-- CreateEnum
CREATE TYPE "role" AS ENUM ('admin', 'customer', 'inspection', 'socmgr');

-- CreateEnum
CREATE TYPE "society_status" AS ENUM ('onboarding', 'active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "device_status" AS ENUM ('Online', 'Offline');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('Issued', 'Due', 'Overdue', 'Disputed', 'Paid');

-- CreateEnum
CREATE TYPE "tank_status" AS ENUM ('healthy', 'medium', 'critical');

-- CreateEnum
CREATE TYPE "severity" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('open', 'done');

-- CreateTable
CREATE TABLE "societies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "total_lights" INTEGER NOT NULL DEFAULT 0,
    "savings_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "society_status" NOT NULL DEFAULT 'active',
    "contact_person" TEXT,
    "contact_phone" TEXT,
    "contract_start" DATE,
    "contract_end" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "societies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "society_id" INTEGER,
    "society_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" BIGSERIAL NOT NULL,
    "society_id" INTEGER NOT NULL,
    "society_name" TEXT,
    "device_name" TEXT NOT NULL,
    "device_type" TEXT,
    "status" "device_status" NOT NULL DEFAULT 'Online',
    "last_seen" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" BIGSERIAL NOT NULL,
    "society_id" INTEGER NOT NULL,
    "society_name" TEXT,
    "reading_time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "power_kw" DECIMAL(10,2),
    "energy_kwh" DECIMAL(12,2),
    "voltage" DECIMAL(6,2),
    "current" DECIMAL(6,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_stats" (
    "id" BIGSERIAL NOT NULL,
    "society_id" INTEGER NOT NULL,
    "society_name" TEXT,
    "today_consumption" DECIMAL(12,2),
    "total_savings" DECIMAL(14,2),
    "savings_percentage" DECIMAL(5,2),
    "system_status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "energy_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" BIGSERIAL NOT NULL,
    "society_id" INTEGER NOT NULL,
    "society_name" TEXT,
    "invoice_number" TEXT NOT NULL,
    "invoice_month" TEXT,
    "amount" DECIMAL(12,2),
    "gst" DECIMAL(12,2),
    "total_amount" DECIMAL(12,2),
    "due_date" DATE,
    "status" "invoice_status" NOT NULL DEFAULT 'Issued',
    "pdf_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_reports" (
    "id" BIGSERIAL NOT NULL,
    "society_id" INTEGER NOT NULL,
    "report_month" TEXT,
    "pdf_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tank_configurations" (
    "id" BIGSERIAL NOT NULL,
    "society_id" INTEGER NOT NULL,
    "tank_name" TEXT NOT NULL,
    "tank_code" TEXT,
    "tank_type" TEXT,
    "location" TEXT,
    "capacity_liters" DECIMAL(12,2),
    "height_meters" DECIMAL(6,2),
    "sensor_offset_cm" DECIMAL(6,2),
    "low_alert_percent" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "critical_alert_percent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "display_order" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tank_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tank_readings" (
    "id" BIGSERIAL NOT NULL,
    "tank_id" BIGINT NOT NULL,
    "water_level_percent" DECIMAL(5,2),
    "current_liters" DECIMAL(12,2),
    "sensor_distance_cm" DECIMAL(6,2),
    "status" "tank_status",
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tank_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_forms" (
    "id" BIGSERIAL NOT NULL,
    "society_id" INTEGER NOT NULL,
    "society_name" TEXT,
    "area" VARCHAR(255) NOT NULL,
    "inspection_date" DATE NOT NULL,
    "inspector_name" VARCHAR(255) NOT NULL,
    "contact_number" VARCHAR(20) NOT NULL,
    "total_lights_checked" INTEGER NOT NULL,
    "faulty_lights" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_form_items" (
    "id" BIGSERIAL NOT NULL,
    "inspection_form_id" BIGINT NOT NULL,
    "location" VARCHAR(255) NOT NULL,
    "issue_type" VARCHAR(100) NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_form_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_reports" (
    "id" BIGSERIAL NOT NULL,
    "society_id" INTEGER NOT NULL,
    "report_type" TEXT,
    "report_date" DATE,
    "pdf_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_society_metrics" (
    "id" BIGSERIAL NOT NULL,
    "society_id" INTEGER NOT NULL,
    "month" DATE NOT NULL,
    "baseline_kwh" DECIMAL(65,30),
    "actual_kwh" DECIMAL(65,30),
    "energy_avoided_kwh" DECIMAL(65,30),
    "co2_avoided_kg" DECIMAL(65,30),
    "bill_saving_inr" DECIMAL(65,30),
    "is_verified_metered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_society_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exceptions" (
    "id" BIGSERIAL NOT NULL,
    "society_id" INTEGER,
    "severity" "severity" NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" BIGSERIAL NOT NULL,
    "society_id" INTEGER,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignee" TEXT,
    "due_at" TIMESTAMPTZ(6),
    "status" "task_status" NOT NULL DEFAULT 'open',

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "profiles_society_id_idx" ON "profiles"("society_id");

-- CreateIndex
CREATE INDEX "profiles_role_idx" ON "profiles"("role");

-- CreateIndex
CREATE INDEX "devices_society_id_idx" ON "devices"("society_id");

-- CreateIndex
CREATE INDEX "meter_readings_society_id_idx" ON "meter_readings"("society_id");

-- CreateIndex
CREATE INDEX "meter_readings_reading_time_idx" ON "meter_readings"("reading_time");

-- CreateIndex
CREATE INDEX "energy_stats_society_id_idx" ON "energy_stats"("society_id");

-- CreateIndex
CREATE INDEX "energy_stats_created_at_idx" ON "energy_stats"("created_at");

-- CreateIndex
CREATE INDEX "invoices_society_id_idx" ON "invoices"("society_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "savings_reports_society_id_idx" ON "savings_reports"("society_id");

-- CreateIndex
CREATE INDEX "tank_configurations_society_id_idx" ON "tank_configurations"("society_id");

-- CreateIndex
CREATE INDEX "tank_readings_tank_id_idx" ON "tank_readings"("tank_id");

-- CreateIndex
CREATE INDEX "tank_readings_received_at_idx" ON "tank_readings"("received_at");

-- CreateIndex
CREATE INDEX "inspection_forms_society_id_idx" ON "inspection_forms"("society_id");

-- CreateIndex
CREATE INDEX "inspection_forms_created_by_idx" ON "inspection_forms"("created_by");

-- CreateIndex
CREATE INDEX "inspection_form_items_inspection_form_id_idx" ON "inspection_form_items"("inspection_form_id");

-- CreateIndex
CREATE INDEX "inspection_reports_society_id_idx" ON "inspection_reports"("society_id");

-- CreateIndex
CREATE INDEX "monthly_society_metrics_society_id_idx" ON "monthly_society_metrics"("society_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_society_metrics_society_id_month_key" ON "monthly_society_metrics"("society_id", "month");

-- CreateIndex
CREATE INDEX "exceptions_society_id_idx" ON "exceptions"("society_id");

-- CreateIndex
CREATE INDEX "exceptions_severity_idx" ON "exceptions"("severity");

-- CreateIndex
CREATE INDEX "tasks_society_id_idx" ON "tasks"("society_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_stats" ADD CONSTRAINT "energy_stats_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_reports" ADD CONSTRAINT "savings_reports_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_configurations" ADD CONSTRAINT "tank_configurations_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_readings" ADD CONSTRAINT "tank_readings_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "tank_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_forms" ADD CONSTRAINT "inspection_forms_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_forms" ADD CONSTRAINT "inspection_forms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_form_items" ADD CONSTRAINT "inspection_form_items_inspection_form_id_fkey" FOREIGN KEY ("inspection_form_id") REFERENCES "inspection_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_society_metrics" ADD CONSTRAINT "monthly_society_metrics_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
