-- AlterTable
ALTER TABLE "change_log" ADD COLUMN     "excluded_at" TIMESTAMP(3),
ADD COLUMN     "excluded_by_id" TEXT,
ADD COLUMN     "excluded_reason" TEXT;

