-- AlterTable
ALTER TABLE "circuits" ADD COLUMN     "replacement_assigned_at" TIMESTAMP(3),
ADD COLUMN     "replacement_assigned_by_id" TEXT,
ADD COLUMN     "replacement_owner_id" TEXT;

-- AlterTable
ALTER TABLE "scheduled_events" ADD COLUMN     "circuit_id" TEXT;

-- AddForeignKey
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_replacement_owner_id_fkey" FOREIGN KEY ("replacement_owner_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_replacement_assigned_by_id_fkey" FOREIGN KEY ("replacement_assigned_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

