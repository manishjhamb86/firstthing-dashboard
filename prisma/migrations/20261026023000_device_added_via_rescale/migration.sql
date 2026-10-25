-- AlterTable
ALTER TABLE "circuit_devices" ADD COLUMN     "added_via_rescale_event_id" TEXT;

-- CreateIndex
CREATE INDEX "circuit_devices_added_via_rescale_event_id_idx" ON "circuit_devices"("added_via_rescale_event_id");

-- AddForeignKey
ALTER TABLE "circuit_devices" ADD CONSTRAINT "circuit_devices_added_via_rescale_event_id_fkey" FOREIGN KEY ("added_via_rescale_event_id") REFERENCES "benchmark_rescale_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
