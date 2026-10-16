-- AlterTable
ALTER TABLE "tank_level_readings" ADD COLUMN     "motor_status" TEXT;

-- AlterTable
ALTER TABLE "water_tanks" ADD COLUMN     "last_motor_status" TEXT;
