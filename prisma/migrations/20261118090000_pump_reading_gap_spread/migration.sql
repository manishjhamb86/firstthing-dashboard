-- AlterEnum
ALTER TYPE "ems_pump_reading_origin" ADD VALUE 'distributed';

-- AlterTable
ALTER TABLE "ems_pump_readings" ADD COLUMN     "opening_kwh" DOUBLE PRECISION,
ADD COLUMN     "opening_total_flow" DOUBLE PRECISION;

