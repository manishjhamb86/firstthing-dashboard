-- CreateEnum
CREATE TYPE "pipeline_stage" AS ENUM ('lead', 'survey_pending', 'closed_lost');

-- CreateEnum
CREATE TYPE "light_count_method" AS ENUM ('walked', 'estimated');

-- AlterEnum
ALTER TYPE "admin_permission" ADD VALUE 'manage_pipeline';

-- AlterEnum
ALTER TYPE "circuit_state" ADD VALUE 'ineligible';

-- AlterTable
ALTER TABLE "circuits" ADD COLUMN     "light_count_exception_approved_by" TEXT,
ADD COLUMN     "light_count_exception_reason" TEXT,
ADD COLUMN     "site_survey_id" TEXT;

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "service_line" "service_line" NOT NULL,
    "stage" "pipeline_stage" NOT NULL DEFAULT 'lead',
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT,
    "meeting_date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "sales_owner_id" TEXT NOT NULL,
    "logged_by_id" TEXT NOT NULL,
    "authoritative" BOOLEAN NOT NULL DEFAULT true,
    "demo_skipped" BOOLEAN NOT NULL DEFAULT false,
    "demo_skip_approved_by" TEXT,
    "demo_skip_reason" TEXT,
    "demo_skip_date" TIMESTAMP(3),
    "proposal_summary" TEXT,
    "proposal_outcome" TEXT,
    "proposal_decided_at" TIMESTAMP(3),
    "closed_lost_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_surveys" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lighting_inventory_areas" (
    "id" TEXT NOT NULL,
    "site_survey_id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "light_type" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "method" "light_count_method" NOT NULL DEFAULT 'walked',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lighting_inventory_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipelines_sales_owner_id_idx" ON "pipelines"("sales_owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_society_id_service_line_key" ON "pipelines"("society_id", "service_line");

-- CreateIndex
CREATE UNIQUE INDEX "site_surveys_pipeline_id_key" ON "site_surveys"("pipeline_id");

-- CreateIndex
CREATE INDEX "lighting_inventory_areas_site_survey_id_idx" ON "lighting_inventory_areas"("site_survey_id");

-- CreateIndex
CREATE INDEX "circuits_site_survey_id_idx" ON "circuits"("site_survey_id");

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_sales_owner_id_fkey" FOREIGN KEY ("sales_owner_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_logged_by_id_fkey" FOREIGN KEY ("logged_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lighting_inventory_areas" ADD CONSTRAINT "lighting_inventory_areas_site_survey_id_fkey" FOREIGN KEY ("site_survey_id") REFERENCES "site_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_site_survey_id_fkey" FOREIGN KEY ("site_survey_id") REFERENCES "site_surveys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
