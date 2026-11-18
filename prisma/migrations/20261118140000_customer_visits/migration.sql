-- CreateEnum
CREATE TYPE "customer_visit_purpose" AS ENUM ('feedback_upsell', 'complaint_followup', 'payment_followup', 'committee_meeting', 'other');

-- CreateEnum
CREATE TYPE "customer_visit_status" AS ENUM ('pending', 'approved', 'sent_back');

-- AlterEnum
ALTER TYPE "admin_permission" ADD VALUE 'approve_visits';

-- CreateTable
CREATE TABLE "customer_visits" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL,
    "period" TEXT NOT NULL,
    "purpose" "customer_visit_purpose" NOT NULL,
    "agenda" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "met_name" TEXT,
    "met_role" TEXT,
    "rating" INTEGER,
    "interests" TEXT[],
    "follow_ups" TEXT,
    "photo_keys" TEXT[],
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "location_accuracy_m" DOUBLE PRECISION,
    "distance_m" DOUBLE PRECISION,
    "status" "customer_visit_status" NOT NULL DEFAULT 'pending',
    "logged_by_id" TEXT NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "customer_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_visits_period_society_id_idx" ON "customer_visits"("period", "society_id");

-- CreateIndex
CREATE INDEX "customer_visits_status_idx" ON "customer_visits"("status");

-- AddForeignKey
ALTER TABLE "customer_visits" ADD CONSTRAINT "customer_visits_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visits" ADD CONSTRAINT "customer_visits_logged_by_id_fkey" FOREIGN KEY ("logged_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visits" ADD CONSTRAINT "customer_visits_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visits" ADD CONSTRAINT "customer_visits_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

