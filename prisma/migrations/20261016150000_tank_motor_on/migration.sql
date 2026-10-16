-- AlterTable
ALTER TABLE "tank_level_readings" ADD COLUMN     "motor_on" BOOLEAN;

-- AlterTable
ALTER TABLE "water_tanks" ADD COLUMN     "last_motor_on" BOOLEAN;
