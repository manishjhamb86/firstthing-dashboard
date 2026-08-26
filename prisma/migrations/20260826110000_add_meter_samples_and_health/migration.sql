-- AlterTable
ALTER TABLE "meter_devices" ADD COLUMN     "last_energy_kwh" DOUBLE PRECISION,
ADD COLUMN     "last_sample_at" TIMESTAMP(3),
ADD COLUMN     "offline_since" TIMESTAMP(3),
ADD COLUMN     "owner_id" TEXT;

-- CreateTable
CREATE TABLE "meter_samples" (
    "id" TEXT NOT NULL,
    "meter_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "online" BOOLEAN NOT NULL,
    "power_w" DOUBLE PRECISION,
    "energy_kwh" DOUBLE PRECISION,
    "reported_at" TIMESTAMP(3),

    CONSTRAINT "meter_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meter_samples_meter_id_recorded_at_idx" ON "meter_samples"("meter_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "meter_devices" ADD CONSTRAINT "meter_devices_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_samples" ADD CONSTRAINT "meter_samples_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meter_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

