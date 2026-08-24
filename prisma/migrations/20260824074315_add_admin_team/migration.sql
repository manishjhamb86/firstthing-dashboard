-- CreateEnum
CREATE TYPE "AdminTeam" AS ENUM ('operations', 'sales', 'support', 'engineering', 'inspection', 'finance');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "team" "AdminTeam" NOT NULL DEFAULT 'operations';
