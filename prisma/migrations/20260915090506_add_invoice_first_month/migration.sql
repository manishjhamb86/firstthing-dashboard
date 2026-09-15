-- CreateEnum
CREATE TYPE "calculation_source" AS ENUM ('readings', 'invoice');

-- CreateEnum
CREATE TYPE "savings_basis" AS ENUM ('measured', 'agreed');

-- CreateEnum
CREATE TYPE "invoice_line_kind" AS ENUM ('service', 'other');

-- AlterEnum
ALTER TYPE "calculation_status" ADD VALUE 'submitted';

-- AlterEnum
ALTER TYPE "reconciliation_status" ADD VALUE 'not_applicable';

-- AlterTable
ALTER TABLE "billing_invoices" ADD COLUMN     "extraction_raw" JSONB,
ADD COLUMN     "invoice_for_month" TEXT,
ADD COLUMN     "subtotal" DOUBLE PRECISION,
ADD COLUMN     "tax_amount" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "circuit_fee_lines" ADD COLUMN     "basis" "savings_basis" NOT NULL DEFAULT 'measured',
ADD COLUMN     "invoice_light_count" INTEGER;

-- AlterTable
ALTER TABLE "monthly_calculations" ADD COLUMN     "rederived_at" TIMESTAMP(3),
ADD COLUMN     "rederived_from_id" TEXT,
ADD COLUMN     "source" "calculation_source" NOT NULL DEFAULT 'readings';

-- CreateTable
CREATE TABLE "billing_invoice_lines" (
    "id" TEXT NOT NULL,
    "billing_invoice_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "hsn" TEXT,
    "qty" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_pct" DOUBLE PRECISION,
    "tax_amount" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL,
    "kind" "invoice_line_kind" NOT NULL,
    "circuit_id" TEXT,
    "arithmetic_ok" BOOLEAN NOT NULL DEFAULT true,
    "arithmetic_note" TEXT,
    "count_disagreement" INTEGER,

    CONSTRAINT "billing_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "represented_count_changes" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "previous_count" INTEGER NOT NULL,
    "next_count" INTEGER NOT NULL,
    "effective_from" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "billing_invoice_id" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "represented_count_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_invoice_lines_circuit_id_idx" ON "billing_invoice_lines"("circuit_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoice_lines_billing_invoice_id_line_no_key" ON "billing_invoice_lines"("billing_invoice_id", "line_no");

-- CreateIndex
CREATE INDEX "represented_count_changes_circuit_id_effective_from_idx" ON "represented_count_changes"("circuit_id", "effective_from");

-- AddForeignKey
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_billing_invoice_id_fkey" FOREIGN KEY ("billing_invoice_id") REFERENCES "billing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "represented_count_changes" ADD CONSTRAINT "represented_count_changes_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "represented_count_changes" ADD CONSTRAINT "represented_count_changes_billing_invoice_id_fkey" FOREIGN KEY ("billing_invoice_id") REFERENCES "billing_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "represented_count_changes" ADD CONSTRAINT "represented_count_changes_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

