-- CreateEnum
CREATE TYPE "demo_report_status" AS ENUM ('draft', 'shared');

-- CreateEnum
CREATE TYPE "kyc_document_type" AS ENUM ('gst_certificate', 'electricity_bill');

-- CreateEnum
CREATE TYPE "kyc_requirement_status" AS ENUM ('outstanding', 'received', 'verified', 'not_applicable');

-- CreateEnum
CREATE TYPE "receipt_channel" AS ENUM ('portal', 'whatsapp', 'email', 'call', 'in_person');

-- CreateEnum
CREATE TYPE "kyc_file_state" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "offer_status" AS ENUM ('draft', 'issued', 'countered', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "benchmark_source" AS ENUM ('measured', 'negotiated_fixed');

-- CreateEnum
CREATE TYPE "contract_status" AS ENUM ('draft', 'active', 'amended', 'expired', 'terminated');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "pipeline_stage" ADD VALUE 'demo_reported';
ALTER TYPE "pipeline_stage" ADD VALUE 'offered';
ALTER TYPE "pipeline_stage" ADD VALUE 'agreed';

-- CreateTable
CREATE TABLE "demo_reports" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "demo_report_status" NOT NULL DEFAULT 'draft',
    "pre_install_baseline_total" DOUBLE PRECISION NOT NULL,
    "post_install_average_total" DOUBLE PRECISION NOT NULL,
    "measured_savings_pct" DOUBLE PRECISION NOT NULL,
    "society_light_count" INTEGER NOT NULL,
    "metered_light_count" INTEGER NOT NULL,
    "extrapolation_factor" DOUBLE PRECISION NOT NULL,
    "projected_savings_kwh_per_day" DOUBLE PRECISION NOT NULL,
    "circuit_snapshot" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shared_at" TIMESTAMP(3),
    "shared_by_id" TEXT,

    CONSTRAINT "demo_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_requirements" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "type" "kyc_document_type" NOT NULL,
    "status" "kyc_requirement_status" NOT NULL DEFAULT 'outstanding',
    "not_applicable_reason" TEXT,
    "marked_na_by_id" TEXT,
    "marked_na_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_document_files" (
    "id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "receipt_channel" "receipt_channel" NOT NULL,
    "state" "kyc_file_state" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_follow_ups" (
    "id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "offer_status" NOT NULL DEFAULT 'draft',
    "benchmark_source" "benchmark_source" NOT NULL,
    "circuit_terms" JSONB NOT NULL,
    "tolerance_pct" DOUBLE PRECISION NOT NULL,
    "revenue_share_pct" DOUBLE PRECISION NOT NULL,
    "unit_electricity_rate" DOUBLE PRECISION NOT NULL,
    "term_months" INTEGER NOT NULL,
    "exclusions" JSONB,
    "amc_terms" JSONB,
    "spare_stock_count" INTEGER NOT NULL DEFAULT 0,
    "projected_monthly_fee" DOUBLE PRECISION,
    "demo_report_id" TEXT,
    "issued_at" TIMESTAMP(3),
    "issued_by_id" TEXT,
    "responded_at" TIMESTAMP(3),
    "responded_by_id" TEXT,
    "response_note" TEXT,
    "countered_from_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "prepared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prepared_by_id" TEXT NOT NULL,
    "printed_at" TIMESTAMP(3),
    "notarized_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "executed_s3_key" TEXT,
    "executed_file_name" TEXT,
    "uploaded_at" TIMESTAMP(3),
    "uploaded_by_id" TEXT,
    "has_deviation" BOOLEAN NOT NULL DEFAULT false,
    "deviation_note" TEXT,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "service_line" "service_line" NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "status" "contract_status" NOT NULL DEFAULT 'draft',
    "term_start" TIMESTAMP(3) NOT NULL,
    "term_end" TIMESTAMP(3) NOT NULL,
    "activated_at" TIMESTAMP(3),
    "activated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_term_versions" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "benchmark_source" "benchmark_source" NOT NULL,
    "tolerance_pct" DOUBLE PRECISION NOT NULL,
    "revenue_share_pct" DOUBLE PRECISION NOT NULL,
    "unit_electricity_rate" DOUBLE PRECISION NOT NULL,
    "exclusions" JSONB,
    "amc_terms" JSONB,
    "spare_stock_count" INTEGER NOT NULL DEFAULT 0,
    "circuit_benchmarks" JSONB NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_term_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demo_reports_pipeline_id_version_key" ON "demo_reports"("pipeline_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_requirements_pipeline_id_type_key" ON "kyc_requirements"("pipeline_id", "type");

-- CreateIndex
CREATE INDEX "kyc_document_files_requirement_id_idx" ON "kyc_document_files"("requirement_id");

-- CreateIndex
CREATE INDEX "kyc_follow_ups_requirement_id_idx" ON "kyc_follow_ups"("requirement_id");

-- CreateIndex
CREATE UNIQUE INDEX "offers_countered_from_id_key" ON "offers"("countered_from_id");

-- CreateIndex
CREATE UNIQUE INDEX "offers_pipeline_id_version_key" ON "offers"("pipeline_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "agreements_pipeline_id_key" ON "agreements"("pipeline_id");

-- CreateIndex
CREATE UNIQUE INDEX "agreements_offer_id_key" ON "agreements"("offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_pipeline_id_key" ON "contracts"("pipeline_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_agreement_id_key" ON "contracts"("agreement_id");

-- CreateIndex
CREATE INDEX "contract_term_versions_contract_id_effective_from_idx" ON "contract_term_versions"("contract_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "contract_term_versions_contract_id_version_key" ON "contract_term_versions"("contract_id", "version");

-- AddForeignKey
ALTER TABLE "demo_reports" ADD CONSTRAINT "demo_reports_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_reports" ADD CONSTRAINT "demo_reports_shared_by_id_fkey" FOREIGN KEY ("shared_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_requirements" ADD CONSTRAINT "kyc_requirements_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_requirements" ADD CONSTRAINT "kyc_requirements_marked_na_by_id_fkey" FOREIGN KEY ("marked_na_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_document_files" ADD CONSTRAINT "kyc_document_files_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "kyc_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_document_files" ADD CONSTRAINT "kyc_document_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_document_files" ADD CONSTRAINT "kyc_document_files_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_follow_ups" ADD CONSTRAINT "kyc_follow_ups_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "kyc_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_follow_ups" ADD CONSTRAINT "kyc_follow_ups_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_demo_report_id_fkey" FOREIGN KEY ("demo_report_id") REFERENCES "demo_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_responded_by_id_fkey" FOREIGN KEY ("responded_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_countered_from_id_fkey" FOREIGN KEY ("countered_from_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_prepared_by_id_fkey" FOREIGN KEY ("prepared_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_activated_by_id_fkey" FOREIGN KEY ("activated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_term_versions" ADD CONSTRAINT "contract_term_versions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_term_versions" ADD CONSTRAINT "contract_term_versions_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
