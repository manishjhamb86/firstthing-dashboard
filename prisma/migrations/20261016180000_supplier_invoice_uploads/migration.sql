-- CreateEnum
CREATE TYPE "SupplierInvoiceUploadStatus" AS ENUM ('uploaded', 'read', 'could_not_read', 'processed');

-- CreateTable
CREATE TABLE "supplier_invoice_uploads" (
    "id" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "status" "SupplierInvoiceUploadStatus" NOT NULL DEFAULT 'uploaded',
    "extraction" JSONB,
    "error_message" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "purchase_id" TEXT,

    CONSTRAINT "supplier_invoice_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoice_uploads_file_hash_key" ON "supplier_invoice_uploads"("file_hash");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoice_uploads_purchase_id_key" ON "supplier_invoice_uploads"("purchase_id");
