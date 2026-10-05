-- AlterTable
ALTER TABLE "meter_readings" ADD COLUMN     "hourly_anomaly_count" INTEGER,
ADD COLUMN     "hourly_normal_count" INTEGER,
ADD COLUMN     "hourly_suspect_count" INTEGER;

