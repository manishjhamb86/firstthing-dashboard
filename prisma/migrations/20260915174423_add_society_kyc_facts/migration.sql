-- AlterTable
ALTER TABLE "societies" ADD COLUMN     "electricity_unit_rate" DOUBLE PRECISION,
ADD COLUMN     "electricity_unit_rate_recorded_at" TIMESTAMP(3),
ADD COLUMN     "gst_number" TEXT,
ADD COLUMN     "gst_number_recorded_at" TIMESTAMP(3);

