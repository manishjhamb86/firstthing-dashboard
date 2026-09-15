-- CreateEnum
CREATE TYPE "invoice_intake_status" AS ENUM ('reading', 'needs_review', 'could_not_read', 'ready', 'submitted', 'refused_duplicate', 'discarded');

-- CreateTable
CREATE TABLE "invoice_intakes" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "invoice_intake_status" NOT NULL DEFAULT 'reading',
    "extraction" JSONB,
    "extraction_error" TEXT,
    "review" JSONB,
    "society_id" TEXT,
    "period" TEXT,
    "monthly_calculation_id" TEXT,
    "billing_invoice_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "discarded_at" TIMESTAMP(3),
    "discard_reason" TEXT,

    CONSTRAINT "invoice_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_intakes_billing_invoice_id_key" ON "invoice_intakes"("billing_invoice_id");

-- CreateIndex
CREATE INDEX "invoice_intakes_status_uploaded_at_idx" ON "invoice_intakes"("status", "uploaded_at");

-- CreateIndex
CREATE INDEX "invoice_intakes_society_id_period_idx" ON "invoice_intakes"("society_id", "period");

-- AddForeignKey
ALTER TABLE "invoice_intakes" ADD CONSTRAINT "invoice_intakes_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_intakes" ADD CONSTRAINT "invoice_intakes_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

