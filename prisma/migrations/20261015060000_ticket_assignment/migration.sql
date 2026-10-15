-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "assigned_at" TIMESTAMP(3),
ADD COLUMN     "assigned_to_id" TEXT;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
