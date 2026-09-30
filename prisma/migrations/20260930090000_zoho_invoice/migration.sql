-- AlterEnum
ALTER TYPE "job_type" ADD VALUE 'zoho_invoice_sync';

-- AlterTable
ALTER TABLE "invoice_intakes" ADD COLUMN     "zoho_changed_at" TIMESTAMP(3),
ADD COLUMN     "zoho_invoice_id" TEXT,
ADD COLUMN     "zoho_last_modified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "zoho_invoice_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "data_center" TEXT NOT NULL DEFAULT 'in',
    "organization_id" TEXT NOT NULL,
    "organization_name" TEXT,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "access_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "import_from" DATE,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_ok_at" TIMESTAMP(3),
    "last_error" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_summary" TEXT,

    CONSTRAINT "zoho_invoice_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_intakes_zoho_invoice_id_key" ON "invoice_intakes"("zoho_invoice_id");

-- AddForeignKey
ALTER TABLE "zoho_invoice_config" ADD CONSTRAINT "zoho_invoice_config_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

