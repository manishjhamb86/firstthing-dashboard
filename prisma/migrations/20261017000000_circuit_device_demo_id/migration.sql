-- AlterTable
ALTER TABLE "circuit_devices" ADD COLUMN     "demo_id" TEXT;

-- CreateIndex
CREATE INDEX "circuit_devices_demo_id_idx" ON "circuit_devices"("demo_id");

-- AddForeignKey
ALTER TABLE "circuit_devices" ADD CONSTRAINT "circuit_devices_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "circuit_demos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

