-- CreateEnum
CREATE TYPE "MeterAlertKind" AS ENUM ('offline', 'out_of_range');

-- AlterTable
ALTER TABLE "meter_devices" DROP COLUMN "last_energy_kwh",
ADD COLUMN     "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_current_a" DOUBLE PRECISION,
ADD COLUMN     "last_day_kwh" DOUBLE PRECISION,
ADD COLUMN     "last_month_kwh" DOUBLE PRECISION,
ADD COLUMN     "last_read_at" TIMESTAMP(3),
ADD COLUMN     "last_voltage_v" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "meter_samples" DROP COLUMN "energy_kwh",
ADD COLUMN     "current_a" DOUBLE PRECISION,
ADD COLUMN     "day_kwh" DOUBLE PRECISION,
ADD COLUMN     "month_kwh" DOUBLE PRECISION,
ADD COLUMN     "voltage_v" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "meter_alerts" (
    "id" TEXT NOT NULL,
    "meter_id" TEXT NOT NULL,
    "kind" "MeterAlertKind" NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_reason" TEXT,

    CONSTRAINT "meter_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_hourly_readings" (
    "id" TEXT NOT NULL,
    "meter_id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "hour" INTEGER NOT NULL,
    "kwh" DOUBLE PRECISION NOT NULL,
    "import_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_hourly_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_csv_imports" (
    "id" TEXT NOT NULL,
    "meter_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "s3_key" TEXT,
    "first_day" TIMESTAMP(3) NOT NULL,
    "last_day" TIMESTAMP(3) NOT NULL,
    "hours_in_file" INTEGER NOT NULL,
    "hours_stored" INTEGER NOT NULL,
    "hours_superseded" INTEGER NOT NULL DEFAULT 0,
    "match_method" TEXT NOT NULL,
    "matched_hours" INTEGER,
    "match_detail" JSONB,
    "overrode_match" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_csv_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meter_alerts_meter_id_opened_at_idx" ON "meter_alerts"("meter_id", "opened_at");

-- CreateIndex
CREATE INDEX "meter_alerts_closed_at_idx" ON "meter_alerts"("closed_at");

-- CreateIndex
CREATE INDEX "meter_hourly_readings_meter_id_day_idx" ON "meter_hourly_readings"("meter_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "meter_hourly_readings_meter_id_day_hour_key" ON "meter_hourly_readings"("meter_id", "day", "hour");

-- CreateIndex
CREATE INDEX "meter_csv_imports_meter_id_uploaded_at_idx" ON "meter_csv_imports"("meter_id", "uploaded_at");

-- AddForeignKey
ALTER TABLE "meter_alerts" ADD CONSTRAINT "meter_alerts_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meter_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_alerts" ADD CONSTRAINT "meter_alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_hourly_readings" ADD CONSTRAINT "meter_hourly_readings_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meter_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_hourly_readings" ADD CONSTRAINT "meter_hourly_readings_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "meter_csv_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_csv_imports" ADD CONSTRAINT "meter_csv_imports_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meter_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_csv_imports" ADD CONSTRAINT "meter_csv_imports_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One OPEN alert per meter per kind. A partial unique index is the structural
-- guarantee; an application check cannot win a race with itself, and the
-- failure mode here is an hourly job filing a duplicate row every hour until
-- the notification list is unreadable.
CREATE UNIQUE INDEX "meter_alerts_open_unique"
  ON "meter_alerts" ("meter_id", "kind")
  WHERE "closed_at" IS NULL;
