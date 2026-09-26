-- DropForeignKey
ALTER TABLE "circuits" DROP CONSTRAINT "circuits_load_validation_override_by_id_fkey";

-- DropForeignKey
ALTER TABLE "circuits" DROP CONSTRAINT "circuits_replacement_assigned_by_id_fkey";

-- DropForeignKey
ALTER TABLE "circuits" DROP CONSTRAINT "circuits_replacement_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "commissioning_readings" DROP CONSTRAINT "commissioning_readings_circuit_id_fkey";

-- DropForeignKey
ALTER TABLE "commissioning_readings" DROP CONSTRAINT "commissioning_readings_recorded_by_id_fkey";

-- AlterTable
ALTER TABLE "circuits" DROP COLUMN "light_replacement_date",
DROP COLUMN "load_discrepancy_pct",
DROP COLUMN "load_validation_override_by_id",
DROP COLUMN "load_validation_override_reason",
DROP COLUMN "meter_displayed_load",
DROP COLUMN "meter_installed_at",
DROP COLUMN "post_demo_from",
DROP COLUMN "post_demo_to",
DROP COLUMN "post_install_baseline",
DROP COLUMN "post_install_window_start_at",
DROP COLUMN "pre_demo_from",
DROP COLUMN "pre_demo_to",
DROP COLUMN "pre_install_window_start_at",
DROP COLUMN "replacement_assigned_at",
DROP COLUMN "replacement_assigned_by_id",
DROP COLUMN "replacement_owner_id";

-- DropTable
DROP TABLE "commissioning_readings";

-- DropEnum
DROP TYPE "commissioning_reading_status";

-- DropEnum
DROP TYPE "commissioning_window_type";

