-- Customer portal revamp (2026-08-29): module grants, tickets, tank setups.

-- CreateEnum
CREATE TYPE "portal_grant" AS ENUM ('electricity', 'water_tanks', 'documents', 'inventory', 'tickets_view', 'tickets_manage', 'society_admin');

-- CreateEnum
CREATE TYPE "tank_setup" AS ENUM ('domestic', 'flush', 'stp');

-- CreateEnum
CREATE TYPE "ticket_type" AS ENUM ('complaint', 'device_replacement', 'pickup');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('open', 'in_progress', 'resolved');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "grants" "portal_grant"[] NOT NULL DEFAULT ARRAY[]::"portal_grant"[];

-- AlterTable
ALTER TABLE "water_tanks" ADD COLUMN "setup_type" "tank_setup";

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "type" "ticket_type" NOT NULL,
    "status" "ticket_status" NOT NULL DEFAULT 'open',
    "subject" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "raised_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "last_status_by_id" TEXT,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tickets_society_id_status_idx" ON "tickets"("society_id", "status");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_last_status_by_id_fkey" FOREIGN KEY ("last_status_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing portal account keeps everything it could see
-- before grants existed — the module tabs were visible to all three
-- authorities, so an empty grant set on deploy would have REVOKED access
-- nobody decided to revoke. society_admin is deliberately not backfilled:
-- the members page becomes the office-bearer's (who holds every grant
-- implicitly), matching the design's own header.
UPDATE "profiles"
SET "grants" = ARRAY['electricity', 'water_tanks', 'documents', 'inventory', 'tickets_view', 'tickets_manage']::"portal_grant"[]
WHERE "portal_authority" IS NOT NULL;
