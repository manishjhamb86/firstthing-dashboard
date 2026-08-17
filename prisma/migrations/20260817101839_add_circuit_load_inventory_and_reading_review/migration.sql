-- CreateEnum
CREATE TYPE "ingest_phase" AS ENUM ('pre_install', 'post_install', 'monitoring');

-- CreateEnum
CREATE TYPE "device_role" AS ENUM ('original', 'replacement');

-- AlterTable
ALTER TABLE "meter_readings" ADD COLUMN     "baseline_excluded_reason" TEXT,
ADD COLUMN     "baseline_included" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "expected_intervals" INTEGER;

-- AlterTable
ALTER TABLE "raw_reading_files" ADD COLUMN     "ingest_phase" "ingest_phase",
ADD COLUMN     "range_end" TIMESTAMP(3),
ADD COLUMN     "range_start" TIMESTAMP(3),
ALTER COLUMN "period" DROP NOT NULL;

-- CreateTable
CREATE TABLE "device_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "device_role" NOT NULL,
    "default_wattage" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_replacement_options" (
    "id" TEXT NOT NULL,
    "original_type_id" TEXT NOT NULL,
    "replacement_type_id" TEXT NOT NULL,

    CONSTRAINT "device_replacement_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuit_devices" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "device_type_id" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "wattage" DOUBLE PRECISION NOT NULL,
    "hours_per_day" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "replacement_type_id" TEXT,
    "replacement_count" INTEGER,
    "replacement_wattage" DOUBLE PRECISION,
    "replaced_at" TIMESTAMP(3),
    "replaced_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circuit_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_types_name_key" ON "device_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "device_replacement_options_original_type_id_replacement_typ_key" ON "device_replacement_options"("original_type_id", "replacement_type_id");

-- CreateIndex
CREATE INDEX "circuit_devices_circuit_id_idx" ON "circuit_devices"("circuit_id");

-- AddForeignKey
ALTER TABLE "device_replacement_options" ADD CONSTRAINT "device_replacement_options_original_type_id_fkey" FOREIGN KEY ("original_type_id") REFERENCES "device_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_replacement_options" ADD CONSTRAINT "device_replacement_options_replacement_type_id_fkey" FOREIGN KEY ("replacement_type_id") REFERENCES "device_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_devices" ADD CONSTRAINT "circuit_devices_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_devices" ADD CONSTRAINT "circuit_devices_device_type_id_fkey" FOREIGN KEY ("device_type_id") REFERENCES "device_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_devices" ADD CONSTRAINT "circuit_devices_replacement_type_id_fkey" FOREIGN KEY ("replacement_type_id") REFERENCES "device_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_devices" ADD CONSTRAINT "circuit_devices_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
