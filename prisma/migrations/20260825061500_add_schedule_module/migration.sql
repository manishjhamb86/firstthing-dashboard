-- CreateEnum
CREATE TYPE "ScheduleKind" AS ENUM ('demo_meeting', 'survey_visit', 'installation_day', 'other');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('scheduled', 'done', 'cancelled');

-- AlterTable
ALTER TABLE "pipelines" DROP COLUMN "survey_contact_name",
DROP COLUMN "survey_contact_phone",
DROP COLUMN "survey_scheduled_at",
DROP COLUMN "survey_visit_note";

-- CreateTable
CREATE TABLE "scheduled_events" (
    "id" TEXT NOT NULL,
    "kind" "ScheduleKind" NOT NULL,
    "title" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "status" "ScheduleStatus" NOT NULL DEFAULT 'scheduled',
    "cancelled_at" TIMESTAMP(3),
    "cancelled_reason" TEXT,
    "assignee_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "pipeline_id" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_events_assignee_id_start_at_idx" ON "scheduled_events"("assignee_id", "start_at");

-- CreateIndex
CREATE INDEX "scheduled_events_start_at_idx" ON "scheduled_events"("start_at");

-- AddForeignKey
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

