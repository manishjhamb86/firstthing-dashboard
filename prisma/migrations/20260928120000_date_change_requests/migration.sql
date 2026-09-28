-- Society timeline (2026-09-28): date change requests after go-live, and the
-- permission that decides them. See prisma/schema.prisma, DateChangeRequest.
ALTER TYPE "admin_permission" ADD VALUE 'approve_date_changes';

CREATE TYPE "date_change_status" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn', 'superseded');

CREATE TABLE "date_change_requests" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "pipeline_id" TEXT,
    "demo_id" TEXT,
    "field" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "date_change_status" NOT NULL DEFAULT 'pending',
    "requested_by_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "date_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "date_change_requests_society_id_status_idx" ON "date_change_requests"("society_id", "status");
CREATE INDEX "date_change_requests_status_requested_at_idx" ON "date_change_requests"("status", "requested_at");

-- One open request per date: a second is refused in words by the action, and
-- by this index when two land at once.
CREATE UNIQUE INDEX "date_change_requests_open_unique" ON "date_change_requests"("field", "entity_id") WHERE "status" = 'pending';

ALTER TABLE "date_change_requests" ADD CONSTRAINT "date_change_requests_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "date_change_requests" ADD CONSTRAINT "date_change_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "date_change_requests" ADD CONSTRAINT "date_change_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
