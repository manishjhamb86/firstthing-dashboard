-- CreateEnum
CREATE TYPE "help_category" AS ENUM ('question', 'bug', 'blocker', 'suggestion');

-- CreateEnum
CREATE TYPE "help_status" AS ENUM ('new', 'open', 'answered', 'in_progress', 'resolved');

-- CreateEnum
CREATE TYPE "help_ai_state" AS ENUM ('pending', 'done', 'failed');

-- CreateEnum
CREATE TYPE "help_author" AS ENUM ('reporter', 'ai', 'staff');

-- AlterEnum
ALTER TYPE "job_type" ADD VALUE 'help_triage_sweep';

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "receives_bug_reports" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "help_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT,
    "page" TEXT NOT NULL,
    "page_title" TEXT,
    "client_info" JSONB,
    "screenshot_key" TEXT,
    "photo_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "voice_key" TEXT,
    "task_event_id" TEXT,
    "category" "help_category",
    "category_source" TEXT,
    "title" TEXT,
    "status" "help_status" NOT NULL DEFAULT 'new',
    "routed_to_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_state" "help_ai_state" NOT NULL DEFAULT 'pending',
    "ai_attempts" INTEGER NOT NULL DEFAULT 0,
    "ai_error" TEXT,
    "ai_read_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_messages" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "author" "help_author" NOT NULL,
    "admin_id" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "help_reports_status_created_at_idx" ON "help_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "help_reports_reporter_id_created_at_idx" ON "help_reports"("reporter_id", "created_at");

-- CreateIndex
CREATE INDEX "help_reports_ai_state_idx" ON "help_reports"("ai_state");

-- CreateIndex
CREATE INDEX "help_messages_report_id_created_at_idx" ON "help_messages"("report_id", "created_at");

-- AddForeignKey
ALTER TABLE "help_reports" ADD CONSTRAINT "help_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_reports" ADD CONSTRAINT "help_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_reports" ADD CONSTRAINT "help_reports_task_event_id_fkey" FOREIGN KEY ("task_event_id") REFERENCES "scheduled_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_messages" ADD CONSTRAINT "help_messages_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "help_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_messages" ADD CONSTRAINT "help_messages_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

