-- Finish the customer portal (2026-08-31): the back office acts on tickets,
-- and the bell knows what a member has seen.

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "notifications_seen_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "last_status_by_admin_id" TEXT;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_last_status_by_admin_id_fkey" FOREIGN KEY ("last_status_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
