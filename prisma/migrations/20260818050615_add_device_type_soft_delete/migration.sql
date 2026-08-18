-- AlterTable
ALTER TABLE "device_types" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "device_types" ADD CONSTRAINT "device_types_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
