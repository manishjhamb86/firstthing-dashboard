-- CreateEnum
CREATE TYPE "field_visit_type" AS ENUM ('installation_day');

-- CreateEnum
CREATE TYPE "field_visit_state" AS ENUM ('scheduled', 'in_progress', 'submitted', 'cancelled');

-- CreateEnum
CREATE TYPE "area_claim_status" AS ENUM ('claimed', 'contested', 'resolved');

-- CreateEnum
CREATE TYPE "installation_project_state" AS ENUM ('planning', 'published', 'complete');

-- CreateEnum
CREATE TYPE "batch_state" AS ENUM ('draft', 'awaiting_review', 'approved', 'disputed');

-- CreateEnum
CREATE TYPE "batch_decision" AS ENUM ('approved', 'disputed');

-- CreateEnum
CREATE TYPE "blocker_type" AS ENUM ('stock_shortage', 'access_denied', 'site_condition', 'count_discrepancy', 'equipment_fault');

-- CreateEnum
CREATE TYPE "blocker_status" AS ENUM ('open', 'resolved', 'waived');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "pipeline_stage" ADD VALUE 'installation';
ALTER TYPE "pipeline_stage" ADD VALUE 'active_billing';

-- CreateTable
CREATE TABLE "field_visits" (
    "id" TEXT NOT NULL,
    "type" "field_visit_type" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "state" "field_visit_state" NOT NULL DEFAULT 'scheduled',
    "scheduled_for" TIMESTAMP(3),
    "proposed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_visit_participants" (
    "id" TEXT NOT NULL,
    "field_visit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "field_visit_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_visit_area_claims" (
    "id" TEXT NOT NULL,
    "field_visit_id" TEXT NOT NULL,
    "area_key" TEXT NOT NULL,
    "claimed_by_id" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "area_claim_status" NOT NULL DEFAULT 'claimed',
    "contested_reason" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,

    CONSTRAINT "field_visit_area_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installation_projects" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "state" "installation_project_state" NOT NULL DEFAULT 'planning',
    "surveyed_light_count" INTEGER NOT NULL,
    "contracted_light_count" INTEGER NOT NULL,
    "scope_variance_note" TEXT,
    "onlooker_id" TEXT NOT NULL,
    "gate_skip_used_at" TIMESTAMP(3),
    "gate_skip_batch_id" TEXT,
    "gate_skip_approved_by" TEXT,
    "gate_skip_reason" TEXT,
    "published_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installation_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installation_planned_days" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "planned_date" TIMESTAMP(3) NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "area_key" TEXT NOT NULL,
    "planned_count" INTEGER NOT NULL,
    "assigned_to_id" TEXT,
    "onlooker_id" TEXT,

    CONSTRAINT "installation_planned_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installation_batches" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "planned_day_id" TEXT,
    "field_visit_id" TEXT,
    "day" INTEGER NOT NULL,
    "area_key" TEXT NOT NULL,
    "location_detail" TEXT,
    "installed_count" INTEGER NOT NULL DEFAULT 0,
    "removed_fittings_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_reason" TEXT,
    "photo_keys" JSONB NOT NULL DEFAULT '[]',
    "state" "batch_state" NOT NULL DEFAULT 'draft',
    "submitted_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installation_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_reviews" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "decision" "batch_decision" NOT NULL,
    "evidence_photo_keys" JSONB,
    "evidence_location" TEXT,
    "note" TEXT,
    "reviewed_by_id" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installation_blockers" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "type" "blocker_type" NOT NULL,
    "area_key" TEXT,
    "detail" TEXT NOT NULL,
    "photo_keys" JSONB NOT NULL DEFAULT '[]',
    "affected_date" TIMESTAMP(3),
    "discovered_light_count" INTEGER,
    "status" "blocker_status" NOT NULL DEFAULT 'open',
    "raised_by_id" TEXT NOT NULL,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolution" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "installation_blockers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completion_certificates" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL,
    "signatory_name" TEXT NOT NULL,
    "signatory_role" TEXT NOT NULL,
    "signature_key" TEXT,
    "total_installed_count" INTEGER NOT NULL,
    "billing_start_date" TIMESTAMP(3) NOT NULL,
    "prorated_days" INTEGER NOT NULL,
    "days_in_month" INTEGER NOT NULL,
    "waived_blocker_ids" JSONB,
    "waiver_reason" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "completion_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_visits_source_type_source_id_idx" ON "field_visits"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_visit_participants_field_visit_id_user_id_key" ON "field_visit_participants"("field_visit_id", "user_id");

-- CreateIndex
CREATE INDEX "field_visit_area_claims_field_visit_id_status_idx" ON "field_visit_area_claims"("field_visit_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "field_visit_area_claims_field_visit_id_area_key_claimed_by__key" ON "field_visit_area_claims"("field_visit_id", "area_key", "claimed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "installation_projects_pipeline_id_key" ON "installation_projects"("pipeline_id");

-- CreateIndex
CREATE INDEX "installation_planned_days_project_id_planned_date_idx" ON "installation_planned_days"("project_id", "planned_date");

-- CreateIndex
CREATE UNIQUE INDEX "installation_planned_days_project_id_day_area_key_key" ON "installation_planned_days"("project_id", "day", "area_key");

-- CreateIndex
CREATE INDEX "installation_batches_project_id_day_idx" ON "installation_batches"("project_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "batch_reviews_batch_id_key" ON "batch_reviews"("batch_id");

-- CreateIndex
CREATE INDEX "installation_blockers_project_id_status_idx" ON "installation_blockers"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "completion_certificates_project_id_key" ON "completion_certificates"("project_id");

-- AddForeignKey
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visit_participants" ADD CONSTRAINT "field_visit_participants_field_visit_id_fkey" FOREIGN KEY ("field_visit_id") REFERENCES "field_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visit_participants" ADD CONSTRAINT "field_visit_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visit_area_claims" ADD CONSTRAINT "field_visit_area_claims_field_visit_id_fkey" FOREIGN KEY ("field_visit_id") REFERENCES "field_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visit_area_claims" ADD CONSTRAINT "field_visit_area_claims_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visit_area_claims" ADD CONSTRAINT "field_visit_area_claims_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_projects" ADD CONSTRAINT "installation_projects_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_projects" ADD CONSTRAINT "installation_projects_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_projects" ADD CONSTRAINT "installation_projects_onlooker_id_fkey" FOREIGN KEY ("onlooker_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_projects" ADD CONSTRAINT "installation_projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_projects" ADD CONSTRAINT "installation_projects_gate_skip_approved_by_fkey" FOREIGN KEY ("gate_skip_approved_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_planned_days" ADD CONSTRAINT "installation_planned_days_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "installation_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_planned_days" ADD CONSTRAINT "installation_planned_days_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_planned_days" ADD CONSTRAINT "installation_planned_days_onlooker_id_fkey" FOREIGN KEY ("onlooker_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_batches" ADD CONSTRAINT "installation_batches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "installation_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_batches" ADD CONSTRAINT "installation_batches_planned_day_id_fkey" FOREIGN KEY ("planned_day_id") REFERENCES "installation_planned_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_batches" ADD CONSTRAINT "installation_batches_field_visit_id_fkey" FOREIGN KEY ("field_visit_id") REFERENCES "field_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_batches" ADD CONSTRAINT "installation_batches_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_reviews" ADD CONSTRAINT "batch_reviews_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "installation_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_reviews" ADD CONSTRAINT "batch_reviews_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_blockers" ADD CONSTRAINT "installation_blockers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "installation_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_blockers" ADD CONSTRAINT "installation_blockers_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "installation_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_blockers" ADD CONSTRAINT "installation_blockers_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_blockers" ADD CONSTRAINT "installation_blockers_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_certificates" ADD CONSTRAINT "completion_certificates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "installation_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_certificates" ADD CONSTRAINT "completion_certificates_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
