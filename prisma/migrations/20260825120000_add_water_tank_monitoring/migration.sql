-- AlterEnum
ALTER TYPE "job_type" ADD VALUE 'tank_level_sample';

-- CreateTable
CREATE TABLE "tank_api_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "base_url" TEXT NOT NULL DEFAULT 'https://openapi.tuyain.com',
    "access_id" TEXT NOT NULL,
    "access_secret" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_ok_at" TIMESTAMP(3),
    "last_error" TEXT,
    "last_device_count" INTEGER,
    "last_sync_at" TIMESTAMP(3),

    CONSTRAINT "tank_api_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_tanks" (
    "id" TEXT NOT NULL,
    "tuya_device_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "has_level_signal" BOOLEAN NOT NULL DEFAULT false,
    "society_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "assigned_by_id" TEXT,
    "last_level_percent" INTEGER,
    "last_online" BOOLEAN NOT NULL DEFAULT false,
    "last_reported_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "water_tanks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tank_level_readings" (
    "id" TEXT NOT NULL,
    "tank_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "level_percent" INTEGER NOT NULL,
    "online" BOOLEAN NOT NULL,
    "reported_at" TIMESTAMP(3),

    CONSTRAINT "tank_level_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "water_tanks_tuya_device_id_key" ON "water_tanks"("tuya_device_id");

-- CreateIndex
CREATE INDEX "water_tanks_society_id_idx" ON "water_tanks"("society_id");

-- CreateIndex
CREATE INDEX "tank_level_readings_tank_id_recorded_at_idx" ON "tank_level_readings"("tank_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "tank_api_config" ADD CONSTRAINT "tank_api_config_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_tanks" ADD CONSTRAINT "water_tanks_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_tanks" ADD CONSTRAINT "water_tanks_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_level_readings" ADD CONSTRAINT "tank_level_readings_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "water_tanks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

