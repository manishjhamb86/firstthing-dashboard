-- CreateEnum
CREATE TYPE "theme" AS ENUM ('light', 'dark', 'slate');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "theme_preference" "theme";

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "theme_preference" "theme";
