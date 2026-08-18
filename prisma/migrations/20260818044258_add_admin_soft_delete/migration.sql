-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
