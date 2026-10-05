-- CreateEnum
CREATE TYPE "reading_day_class" AS ENUM ('complete', 'partial');

-- AlterTable
ALTER TABLE "meter_readings" ADD COLUMN     "day_class" "reading_day_class",
ADD COLUMN     "day_class_hours_expected" INTEGER,
ADD COLUMN     "day_class_hours_present" INTEGER,
ADD COLUMN     "valid_override_at" TIMESTAMP(3),
ADD COLUMN     "valid_override_by_id" TEXT,
ADD COLUMN     "valid_override_reason" TEXT;

