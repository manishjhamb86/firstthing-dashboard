-- AlterTable
ALTER TABLE "circuit_devices" ADD COLUMN     "historical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "historical_note" TEXT,
ADD COLUMN     "recorded_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "circuit_devices" ADD CONSTRAINT "circuit_devices_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
