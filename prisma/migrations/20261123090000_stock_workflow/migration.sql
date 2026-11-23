-- CreateEnum
CREATE TYPE "purchase_requirement_status" AS ENUM ('draft', 'sent', 'partly_received', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "issue_purpose" AS ENUM ('full_installation', 'demo_installation', 'replacement', 'spare_on_site');

-- AlterEnum
ALTER TYPE "inventory_unit_status" ADD VALUE 'written_off';

-- AlterEnum
ALTER TYPE "stock_location_kind" ADD VALUE 'employee';

-- AlterEnum
ALTER TYPE "stock_movement_kind" ADD VALUE 'issue';

-- AlterTable
ALTER TABLE "inventory_batches" ADD COLUMN     "purchase_requirement_id" TEXT;

-- AlterTable
ALTER TABLE "stock_locations" ADD COLUMN     "admin_user_id" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "issue_slip_id" TEXT;

-- CreateTable
CREATE TABLE "stock_requirements" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "item_type_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "updated_by_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requirements" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "purchase_requirement_status" NOT NULL DEFAULT 'draft',
    "supplier_id" TEXT,
    "sent_on" TIMESTAMP(3),
    "po_number" TEXT,
    "notes" TEXT,
    "cancel_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requirement_lines" (
    "id" TEXT NOT NULL,
    "purchase_requirement_id" TEXT NOT NULL,
    "item_type_id" TEXT NOT NULL,
    "society_id" TEXT,
    "shortfall" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "purchase_requirement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_slips" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "from_location_id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "purpose" "issue_purpose" NOT NULL,
    "issued_on" TIMESTAMP(3) NOT NULL,
    "due_on" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_slips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_requirements_society_id_item_type_id_key" ON "stock_requirements"("society_id", "item_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requirements_code_key" ON "purchase_requirements"("code");

-- CreateIndex
CREATE INDEX "purchase_requirement_lines_purchase_requirement_id_idx" ON "purchase_requirement_lines"("purchase_requirement_id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_slips_code_key" ON "issue_slips"("code");

-- CreateIndex
CREATE INDEX "issue_slips_employee_id_closed_at_idx" ON "issue_slips"("employee_id", "closed_at");

-- CreateIndex
CREATE INDEX "issue_slips_society_id_idx" ON "issue_slips"("society_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_admin_user_id_key" ON "stock_locations"("admin_user_id");

-- CreateIndex
CREATE INDEX "stock_movements_issue_slip_id_idx" ON "stock_movements"("issue_slip_id");

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_purchase_requirement_id_fkey" FOREIGN KEY ("purchase_requirement_id") REFERENCES "purchase_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_issue_slip_id_fkey" FOREIGN KEY ("issue_slip_id") REFERENCES "issue_slips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requirements" ADD CONSTRAINT "stock_requirements_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requirements" ADD CONSTRAINT "stock_requirements_item_type_id_fkey" FOREIGN KEY ("item_type_id") REFERENCES "inventory_item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requirements" ADD CONSTRAINT "purchase_requirements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requirement_lines" ADD CONSTRAINT "purchase_requirement_lines_purchase_requirement_id_fkey" FOREIGN KEY ("purchase_requirement_id") REFERENCES "purchase_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requirement_lines" ADD CONSTRAINT "purchase_requirement_lines_item_type_id_fkey" FOREIGN KEY ("item_type_id") REFERENCES "inventory_item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requirement_lines" ADD CONSTRAINT "purchase_requirement_lines_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_slips" ADD CONSTRAINT "issue_slips_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

