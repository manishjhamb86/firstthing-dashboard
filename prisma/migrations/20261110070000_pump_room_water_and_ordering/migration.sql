-- AlterTable
ALTER TABLE "ems_pump_readings" ADD COLUMN     "daily_kl" DOUBLE PRECISION,
ADD COLUMN     "water_went_backwards" BOOLEAN NOT NULL DEFAULT false;

