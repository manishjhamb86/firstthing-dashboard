-- CreateEnum
CREATE TYPE "calculation_status" AS ENUM ('held', 'calculated', 'released', 'sent_back', 'superseded');

-- CreateEnum
CREATE TYPE "compliance_result" AS ENUM ('in_band', 'out_of_band');

-- CreateEnum
CREATE TYPE "pricing_basis" AS ENUM ('fixed', 'actual_metered');

-- CreateEnum
CREATE TYPE "deviation_root_cause" AS ENUM ('firsthing_attributable', 'lighting_layout_change', 'blocked_sensors', 'usage_pattern_change', 'external_electrical', 'society_maintenance');

-- CreateEnum
CREATE TYPE "deviation_review_state" AS ENUM ('raised', 'assigned', 'investigated', 'decided', 'closed', 'escalated');

-- CreateEnum
CREATE TYPE "billing_invoice_status" AS ENUM ('attached', 'released', 'overdue', 'warning', 'suspended', 'paid');

-- CreateEnum
CREATE TYPE "reconciliation_status" AS ENUM ('unchecked', 'matched', 'mismatched', 'acknowledged');

-- AlterEnum
ALTER TYPE "admin_permission" ADD VALUE 'release_billing';

-- CreateTable
CREATE TABLE "monthly_calculations" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "service_line" "service_line" NOT NULL,
    "period" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "calculation_status" NOT NULL DEFAULT 'held',
    "held_reason" TEXT,
    "total_extrapolated_kwh" DOUBLE PRECISION NOT NULL,
    "total_saved_kwh" DOUBLE PRECISION NOT NULL,
    "total_saved_value" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "prorated_days" INTEGER,
    "days_in_month" INTEGER,
    "coverage_days" INTEGER NOT NULL,
    "coverage_of_days" INTEGER NOT NULL,
    "input_version_snapshot" JSONB NOT NULL,
    "contract_term_version_id" TEXT,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "released_by_id" TEXT,
    "sent_back_at" TIMESTAMP(3),
    "sent_back_by_id" TEXT,
    "sent_back_note" TEXT,
    "superseded_by_id" TEXT,
    "superseded_at" TIMESTAMP(3),

    CONSTRAINT "monthly_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuit_fee_lines" (
    "id" TEXT NOT NULL,
    "monthly_calculation_id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "metered_kwh" DOUBLE PRECISION NOT NULL,
    "metered_light_count" INTEGER NOT NULL,
    "represented_light_count" INTEGER NOT NULL,
    "extrapolated_consumption" DOUBLE PRECISION NOT NULL,
    "baseline_kwh_per_day" DOUBLE PRECISION NOT NULL,
    "benchmark_savings_pct" DOUBLE PRECISION NOT NULL,
    "measured_savings_pct" DOUBLE PRECISION NOT NULL,
    "deviation_pct" DOUBLE PRECISION NOT NULL,
    "compliance_result" "compliance_result" NOT NULL,
    "approaching" BOOLEAN NOT NULL DEFAULT false,
    "pricing_basis" "pricing_basis" NOT NULL DEFAULT 'fixed',
    "consecutive_breach_count" INTEGER NOT NULL DEFAULT 0,
    "saved_kwh" DOUBLE PRECISION NOT NULL,
    "saved_value" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "coverage_days" INTEGER NOT NULL,

    CONSTRAINT "circuit_fee_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deviation_reviews" (
    "id" TEXT NOT NULL,
    "circuit_fee_line_id" TEXT NOT NULL,
    "state" "deviation_review_state" NOT NULL DEFAULT 'raised',
    "root_cause" "deviation_root_cause",
    "decision" TEXT,
    "corrected_at_no_cost" BOOLEAN NOT NULL DEFAULT false,
    "society_explanation" TEXT,
    "assigned_to_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "findings" TEXT,
    "owner_id" TEXT,
    "escalated_at" TIMESTAMP(3),
    "escalation_note" TEXT,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "deviation_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_reports" (
    "id" TEXT NOT NULL,
    "monthly_calculation_id" TEXT NOT NULL,
    "narrative" TEXT,
    "provenance" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" TEXT NOT NULL,
    "monthly_calculation_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "s3_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "reconciliation_status" "reconciliation_status" NOT NULL DEFAULT 'unchecked',
    "computed_amount" DOUBLE PRECISION NOT NULL,
    "mismatch_acknowledged_by_id" TEXT,
    "mismatch_acknowledged_note" TEXT,
    "status" "billing_invoice_status" NOT NULL DEFAULT 'attached',
    "released_at" TIMESTAMP(3),
    "overdue_tracking_at" TIMESTAMP(3),
    "warning_started_at" TIMESTAMP(3),
    "suspend_due_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "confirmed_as_of" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_extensions" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "granted_by_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_calculations_superseded_by_id_key" ON "monthly_calculations"("superseded_by_id");

-- CreateIndex
CREATE INDEX "monthly_calculations_status_period_idx" ON "monthly_calculations"("status", "period");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_calculations_society_id_service_line_period_version_key" ON "monthly_calculations"("society_id", "service_line", "period", "version");

-- CreateIndex
CREATE INDEX "circuit_fee_lines_circuit_id_idx" ON "circuit_fee_lines"("circuit_id");

-- CreateIndex
CREATE UNIQUE INDEX "circuit_fee_lines_monthly_calculation_id_circuit_id_key" ON "circuit_fee_lines"("monthly_calculation_id", "circuit_id");

-- CreateIndex
CREATE UNIQUE INDEX "deviation_reviews_circuit_fee_line_id_key" ON "deviation_reviews"("circuit_fee_line_id");

-- CreateIndex
CREATE INDEX "deviation_reviews_state_idx" ON "deviation_reviews"("state");

-- CreateIndex
CREATE UNIQUE INDEX "savings_reports_monthly_calculation_id_key" ON "savings_reports"("monthly_calculation_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_monthly_calculation_id_key" ON "billing_invoices"("monthly_calculation_id");

-- CreateIndex
CREATE INDEX "billing_invoices_status_suspend_due_at_idx" ON "billing_invoices"("status", "suspend_due_at");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_extensions_invoice_id_idx" ON "invoice_extensions"("invoice_id");

-- AddForeignKey
ALTER TABLE "monthly_calculations" ADD CONSTRAINT "monthly_calculations_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_calculations" ADD CONSTRAINT "monthly_calculations_contract_term_version_id_fkey" FOREIGN KEY ("contract_term_version_id") REFERENCES "contract_term_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_calculations" ADD CONSTRAINT "monthly_calculations_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_calculations" ADD CONSTRAINT "monthly_calculations_sent_back_by_id_fkey" FOREIGN KEY ("sent_back_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_calculations" ADD CONSTRAINT "monthly_calculations_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "monthly_calculations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_fee_lines" ADD CONSTRAINT "circuit_fee_lines_monthly_calculation_id_fkey" FOREIGN KEY ("monthly_calculation_id") REFERENCES "monthly_calculations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_fee_lines" ADD CONSTRAINT "circuit_fee_lines_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deviation_reviews" ADD CONSTRAINT "deviation_reviews_circuit_fee_line_id_fkey" FOREIGN KEY ("circuit_fee_line_id") REFERENCES "circuit_fee_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deviation_reviews" ADD CONSTRAINT "deviation_reviews_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deviation_reviews" ADD CONSTRAINT "deviation_reviews_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_reports" ADD CONSTRAINT "savings_reports_monthly_calculation_id_fkey" FOREIGN KEY ("monthly_calculation_id") REFERENCES "monthly_calculations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_monthly_calculation_id_fkey" FOREIGN KEY ("monthly_calculation_id") REFERENCES "monthly_calculations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_mismatch_acknowledged_by_id_fkey" FOREIGN KEY ("mismatch_acknowledged_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_extensions" ADD CONSTRAINT "invoice_extensions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_extensions" ADD CONSTRAINT "invoice_extensions_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
