-- CreateTable
CREATE TABLE "ewelink_api_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "region" TEXT NOT NULL DEFAULT 'as',
    "app_id" TEXT NOT NULL,
    "app_secret" TEXT NOT NULL,
    "redirect_url" TEXT NOT NULL,
    "access_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token" TEXT,
    "refresh_token_expires_at" TIMESTAMP(3),
    "account_label" TEXT,
    "last_ok_at" TIMESTAMP(3),
    "last_error" TEXT,
    "last_device_count" INTEGER,
    "last_sync_at" TIMESTAMP(3),
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ewelink_api_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_devices" (
    "id" TEXT NOT NULL,
    "ewelink_device_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_model" TEXT NOT NULL,
    "uiid" INTEGER NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "has_energy_signal" BOOLEAN NOT NULL DEFAULT false,
    "observed_params" JSONB,
    "society_id" TEXT,
    "circuit_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "assigned_by_id" TEXT,
    "last_power_w" DOUBLE PRECISION,
    "last_reported_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meter_devices_ewelink_device_id_key" ON "meter_devices"("ewelink_device_id");

-- CreateIndex
CREATE UNIQUE INDEX "meter_devices_circuit_id_key" ON "meter_devices"("circuit_id");

-- CreateIndex
CREATE INDEX "meter_devices_society_id_idx" ON "meter_devices"("society_id");

-- AddForeignKey
ALTER TABLE "ewelink_api_config" ADD CONSTRAINT "ewelink_api_config_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_devices" ADD CONSTRAINT "meter_devices_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_devices" ADD CONSTRAINT "meter_devices_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_devices" ADD CONSTRAINT "meter_devices_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

