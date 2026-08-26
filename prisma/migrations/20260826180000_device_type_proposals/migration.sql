-- CreateEnum
CREATE TYPE "device_type_status" AS ENUM ('proposed', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "device_types" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" TEXT,
ADD COLUMN     "in_catalog" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "proposed_by_id" TEXT,
ADD COLUMN     "proposed_note" TEXT,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "status" "device_type_status" NOT NULL DEFAULT 'approved';

-- AddForeignKey
ALTER TABLE "device_types" ADD CONSTRAINT "device_types_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_types" ADD CONSTRAINT "device_types_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

