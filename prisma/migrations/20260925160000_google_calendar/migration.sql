-- AlterEnum
ALTER TYPE "ScheduleKind" ADD VALUE 'meeting';

-- AlterEnum
ALTER TYPE "job_type" ADD VALUE 'calendar_sync';

-- AlterTable
ALTER TABLE "scheduled_events" ADD COLUMN     "add_meet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "calendar_sync_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "calendar_sync_error" TEXT,
ADD COLUMN     "calendar_synced_at" TIMESTAMP(3),
ADD COLUMN     "google_event_id" TEXT,
ADD COLUMN     "google_html_link" TEXT,
ADD COLUMN     "google_organizer" TEXT,
ADD COLUMN     "meet_link" TEXT;

-- CreateTable
CREATE TABLE "scheduled_event_attendees" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "admin_user_id" TEXT,
    "email" TEXT NOT NULL,
    "response_status" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_event_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "client_email" TEXT NOT NULL,
    "private_key" TEXT NOT NULL,
    "workspace_domain" TEXT NOT NULL,
    "fallback_organizer" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_ok_at" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "google_calendar_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_event_attendees_admin_user_id_idx" ON "scheduled_event_attendees"("admin_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_event_attendees_event_id_email_key" ON "scheduled_event_attendees"("event_id", "email");

-- AddForeignKey
ALTER TABLE "scheduled_event_attendees" ADD CONSTRAINT "scheduled_event_attendees_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "scheduled_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_event_attendees" ADD CONSTRAINT "scheduled_event_attendees_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_config" ADD CONSTRAINT "google_calendar_config_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

