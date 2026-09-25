-- CreateEnum
CREATE TYPE "inventory_tracking" AS ENUM ('serial', 'length', 'quantity');

-- CreateEnum
CREATE TYPE "warranty_basis" AS ENUM ('purchase', 'install');

-- CreateEnum
CREATE TYPE "stock_location_kind" AS ENUM ('office', 'site');

-- CreateEnum
CREATE TYPE "inventory_unit_status" AS ENUM ('in_stock', 'deployed', 'faulty', 'returned_to_supplier', 'scrapped', 'lost');

-- CreateEnum
CREATE TYPE "stock_movement_kind" AS ENUM ('receive', 'transfer', 'deploy', 'return', 'fault', 'repair', 'return_to_supplier', 'scrap', 'lost', 'adjust');

-- CreateTable
CREATE TABLE "inventory_item_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tracking" "inventory_tracking" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "make" TEXT,
    "model" TEXT,
    "device_type_id" TEXT,
    "default_warranty_months" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_item_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "gstin" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" TEXT NOT NULL,
    "kind" "stock_location_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "society_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_purchases" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "total" DOUBLE PRECISION,
    "invoice_s3_key" TEXT,
    "invoice_file_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "inventory_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_batches" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "item_type_id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "received_at_location_id" TEXT NOT NULL,
    "received_on" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_cost" DOUBLE PRECISION,
    "supplier_lot" TEXT,
    "manufactured_on" TIMESTAMP(3),
    "warranty_months" INTEGER,
    "warranty_basis" "warranty_basis" NOT NULL DEFAULT 'purchase',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_units" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "item_type_id" TEXT NOT NULL,
    "serial_number" TEXT,
    "status" "inventory_unit_status" NOT NULL DEFAULT 'in_stock',
    "location_id" TEXT,
    "circuit_id" TEXT,
    "deployed_on" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "kind" "stock_movement_kind" NOT NULL,
    "on" TIMESTAMP(3) NOT NULL,
    "item_type_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "unit_id" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "from_location_id" TEXT,
    "to_location_id" TEXT,
    "circuit_id" TEXT,
    "reason" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" TEXT NOT NULL,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_item_types_name_key" ON "inventory_item_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key_key" ON "suppliers"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_society_id_key" ON "stock_locations"("society_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_purchases_supplier_id_invoice_number_key" ON "inventory_purchases"("supplier_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_batches_code_key" ON "inventory_batches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_units_code_key" ON "inventory_units"("code");

-- CreateIndex
CREATE INDEX "inventory_units_batch_id_idx" ON "inventory_units"("batch_id");

-- CreateIndex
CREATE INDEX "inventory_units_location_id_status_idx" ON "inventory_units"("location_id", "status");

-- CreateIndex
CREATE INDEX "stock_movements_unit_id_idx" ON "stock_movements"("unit_id");

-- CreateIndex
CREATE INDEX "stock_movements_batch_id_idx" ON "stock_movements"("batch_id");

-- CreateIndex
CREATE INDEX "stock_movements_to_location_id_idx" ON "stock_movements"("to_location_id");

-- CreateIndex
CREATE INDEX "stock_movements_from_location_id_idx" ON "stock_movements"("from_location_id");

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_purchases" ADD CONSTRAINT "inventory_purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_item_type_id_fkey" FOREIGN KEY ("item_type_id") REFERENCES "inventory_item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "inventory_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_received_at_location_id_fkey" FOREIGN KEY ("received_at_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_item_type_id_fkey" FOREIGN KEY ("item_type_id") REFERENCES "inventory_item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_type_id_fkey" FOREIGN KEY ("item_type_id") REFERENCES "inventory_item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Seed (2026-09-25, the user's list): the item types tracked one by one, LAN
-- wire in metres, and one stock item per light FirsThing installs (linked to
-- its catalog entry by name, so it works whatever the catalog ids are).
INSERT INTO "inventory_item_types" ("id", "name", "category", "tracking", "unit") VALUES
  ('inv-it-meter', 'Smart meter', 'meter', 'serial', 'pcs'),
  ('inv-it-router', 'WiFi router', 'network', 'serial', 'pcs'),
  ('inv-it-extender', 'WiFi extender', 'network', 'serial', 'pcs'),
  ('inv-it-sim', 'SIM card', 'network', 'serial', 'pcs'),
  ('inv-it-tank-monitor', 'Tank monitor', 'water', 'serial', 'pcs'),
  ('inv-it-valve', 'Actuator valve', 'water', 'serial', 'pcs'),
  ('inv-it-valve-controller', 'Actuator valve controller', 'water', 'serial', 'pcs'),
  ('inv-it-float-switch', 'Float switch', 'water', 'serial', 'pcs'),
  ('inv-it-lan-wire', 'LAN wire', 'cable', 'length', 'm')
ON CONFLICT DO NOTHING;

INSERT INTO "inventory_item_types" ("id", "name", "category", "tracking", "unit", "device_type_id")
SELECT 'inv-it-light-' || md5(dt.name), dt.name, 'light', 'serial', 'pcs', dt.id
FROM "device_types" dt
WHERE dt.role = 'replacement' AND dt.active = true AND dt.status = 'approved'
ON CONFLICT DO NOTHING;
