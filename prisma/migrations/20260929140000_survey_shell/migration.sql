-- CreateEnum
CREATE TYPE "site_survey_status" AS ENUM ('draft', 'submitted');

-- CreateEnum
CREATE TYPE "survey_section_key" AS ENUM ('profile', 'inventory', 'circuits', 'pump_room');

-- CreateEnum
CREATE TYPE "survey_section_state" AS ENUM ('not_started', 'in_progress', 'complete', 'flagged', 'queried');

-- CreateEnum
CREATE TYPE "survey_photo_subject" AS ENUM ('site', 'area', 'circuit', 'pump_unit', 'logbook');

-- CreateEnum
CREATE TYPE "pump_unit_category" AS ENUM ('flow_meter', 'pressure_switch', 'vfd', 'energy_meter', 'float_switch', 'actuator_valve');

-- CreateEnum
CREATE TYPE "pump_unit_condition" AS ENUM ('working', 'working_with_faults', 'not_working', 'unknown');

-- AlterEnum
ALTER TYPE "field_visit_type" ADD VALUE 'survey';

-- AlterEnum
ALTER TYPE "light_count_method" ADD VALUE 'records';

-- AlterTable
ALTER TABLE "circuits" ADD COLUMN     "typicality_note" TEXT;

-- AlterTable
ALTER TABLE "field_visit_participants" ADD COLUMN     "pending_count" INTEGER,
ADD COLUMN     "pending_reported_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "lighting_inventory_areas" ADD COLUMN     "area_type" TEXT,
ADD COLUMN     "counted_by_id" TEXT,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by_id" TEXT;

-- AlterTable
ALTER TABLE "site_surveys" ADD COLUMN     "access_hours" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "gate_contact_name" TEXT,
ADD COLUMN     "gate_contact_phone" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "location_accuracy_m" DOUBLE PRECISION,
ADD COLUMN     "location_manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "next_election_date" TIMESTAMP(3),
ADD COLUMN     "notice_days" INTEGER,
ADD COLUMN     "notice_required" TEXT,
ADD COLUMN     "parking_notes" TEXT,
ADD COLUMN     "pass_id_notes" TEXT,
ADD COLUMN     "rwa_member_count" INTEGER,
ADD COLUMN     "status" "site_survey_status" NOT NULL DEFAULT 'draft',
ADD COLUMN     "submitted_at" TIMESTAMP(3),
ADD COLUMN     "submitted_by_id" TEXT;

-- AlterTable
ALTER TABLE "society_members" ADD COLUMN     "primary_contact" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "survey_sections" (
    "id" TEXT NOT NULL,
    "site_survey_id" TEXT NOT NULL,
    "section" "survey_section_key" NOT NULL,
    "state" "survey_section_state" NOT NULL DEFAULT 'not_started',
    "flag_reason" TEXT,
    "query_note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "survey_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_photos" (
    "id" TEXT NOT NULL,
    "site_survey_id" TEXT NOT NULL,
    "subject" "survey_photo_subject" NOT NULL,
    "subject_key" TEXT NOT NULL DEFAULT '',
    "month" TEXT,
    "key" TEXT NOT NULL,
    "taken_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_type_outcomes" (
    "id" TEXT NOT NULL,
    "site_survey_id" TEXT NOT NULL,
    "light_type" TEXT NOT NULL,
    "light_type_key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_type_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pump_room_audits" (
    "id" TEXT NOT NULL,
    "site_survey_id" TEXT NOT NULL,
    "pump_type" TEXT,
    "pump_hp" DOUBLE PRECISION,
    "pump_count" INTEGER,
    "feed_pipe" TEXT,
    "outflow_pipe" TEXT,
    "vfd_arrangement" TEXT,
    "towers" JSONB NOT NULL DEFAULT '[]',
    "logbook_not_maintained" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "pump_room_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pump_room_units" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "unit_key" TEXT NOT NULL,
    "category" "pump_unit_category" NOT NULL,
    "installed" BOOLEAN,
    "brand" TEXT,
    "model" TEXT,
    "condition" "pump_unit_condition",
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "pump_room_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "survey_sections_site_survey_id_section_key" ON "survey_sections"("site_survey_id", "section");

-- CreateIndex
CREATE UNIQUE INDEX "survey_photos_key_key" ON "survey_photos"("key");

-- CreateIndex
CREATE INDEX "survey_photos_site_survey_id_subject_subject_key_idx" ON "survey_photos"("site_survey_id", "subject", "subject_key");

-- CreateIndex
CREATE UNIQUE INDEX "survey_type_outcomes_site_survey_id_light_type_key_key" ON "survey_type_outcomes"("site_survey_id", "light_type_key");

-- CreateIndex
CREATE UNIQUE INDEX "pump_room_audits_site_survey_id_key" ON "pump_room_audits"("site_survey_id");

-- CreateIndex
CREATE UNIQUE INDEX "pump_room_units_audit_id_unit_key_key" ON "pump_room_units"("audit_id", "unit_key");

-- AddForeignKey
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_sections" ADD CONSTRAINT "survey_sections_site_survey_id_fkey" FOREIGN KEY ("site_survey_id") REFERENCES "site_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_sections" ADD CONSTRAINT "survey_sections_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_photos" ADD CONSTRAINT "survey_photos_site_survey_id_fkey" FOREIGN KEY ("site_survey_id") REFERENCES "site_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_photos" ADD CONSTRAINT "survey_photos_taken_by_id_fkey" FOREIGN KEY ("taken_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_type_outcomes" ADD CONSTRAINT "survey_type_outcomes_site_survey_id_fkey" FOREIGN KEY ("site_survey_id") REFERENCES "site_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_type_outcomes" ADD CONSTRAINT "survey_type_outcomes_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pump_room_audits" ADD CONSTRAINT "pump_room_audits_site_survey_id_fkey" FOREIGN KEY ("site_survey_id") REFERENCES "site_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pump_room_audits" ADD CONSTRAINT "pump_room_audits_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pump_room_units" ADD CONSTRAINT "pump_room_units_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "pump_room_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pump_room_units" ADD CONSTRAINT "pump_room_units_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lighting_inventory_areas" ADD CONSTRAINT "lighting_inventory_areas_counted_by_id_fkey" FOREIGN KEY ("counted_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lighting_inventory_areas" ADD CONSTRAINT "lighting_inventory_areas_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one current primary contact per society (the person offers,
-- reports and invoices go to). A partial index, like meter_alerts_open_unique:
-- an ended member keeps their flag as history without blocking a successor.
CREATE UNIQUE INDEX "society_members_primary_contact_unique"
  ON "society_members" ("society_id")
  WHERE "primary_contact" = true AND "ended_on" IS NULL;

-- SCR-010's posts that are not governance roles but are who a field worker
-- actually calls. The positions list is managed; these join it.
INSERT INTO "member_positions" ("id", "name", "name_key", "sort_order")
SELECT v.id, v.name, v.key, v.sort
FROM (VALUES ('pos-security-incharge', 'Security in-charge', 'security in charge', 90),
             ('pos-electrician', 'Electrician', 'electrician', 91)) AS v(id, name, key, sort)
WHERE NOT EXISTS (SELECT 1 FROM "member_positions" p WHERE p."name_key" = v.key);
