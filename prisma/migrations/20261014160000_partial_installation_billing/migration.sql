-- AlterTable
ALTER TABLE "completion_certificates" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "completed_by_id" TEXT,
ADD COLUMN     "full_light_count" INTEGER,
ADD COLUMN     "is_partial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partial_reason" TEXT;

-- AddForeignKey
ALTER TABLE "completion_certificates" ADD CONSTRAINT "completion_certificates_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
