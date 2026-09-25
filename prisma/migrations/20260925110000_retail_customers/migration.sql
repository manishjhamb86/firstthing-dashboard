-- AlterTable
ALTER TABLE "invoice_intakes" ADD COLUMN     "retail_invoice_id" TEXT;

-- CreateTable
CREATE TABLE "retail_customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "gstin" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "society_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "retail_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_invoices" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "period" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION,
    "tax_amount" DOUBLE PRECISION,
    "total" DOUBLE PRECISION NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_on" TIMESTAMP(3),
    "s3_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "retail_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retail_customers_name_key_key" ON "retail_customers"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "retail_customers_gstin_key" ON "retail_customers"("gstin");

-- CreateIndex
CREATE INDEX "retail_invoices_customer_id_idx" ON "retail_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "retail_invoices_invoice_number_idx" ON "retail_invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_intakes_retail_invoice_id_key" ON "invoice_intakes"("retail_invoice_id");

-- AddForeignKey
ALTER TABLE "retail_customers" ADD CONSTRAINT "retail_customers_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_invoices" ADD CONSTRAINT "retail_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "retail_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

