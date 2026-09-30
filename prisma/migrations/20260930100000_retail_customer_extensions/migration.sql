
-- AlterTable
ALTER TABLE "retail_invoices" ALTER COLUMN "s3_key" DROP NOT NULL,
ALTER COLUMN "file_name" DROP NOT NULL;

-- AlterTable
ALTER TABLE "scheduled_events" ADD COLUMN     "retail_customer_id" TEXT;

-- CreateTable
CREATE TABLE "retail_payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paid_on" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "retail_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retail_payments_invoice_id_idx" ON "retail_payments"("invoice_id");

-- AddForeignKey
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_retail_customer_id_fkey" FOREIGN KEY ("retail_customer_id") REFERENCES "retail_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_payments" ADD CONSTRAINT "retail_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "retail_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "retail_invoices" ADD CONSTRAINT "retail_invoices_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
