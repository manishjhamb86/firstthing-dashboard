-- CreateEnum
CREATE TYPE "testimonial_status" AS ENUM ('pending', 'published', 'held', 'rejected');

-- CreateEnum
CREATE TYPE "testimonial_source" AS ENUM ('portal', 'imported', 'back_office');

-- CreateEnum
CREATE TYPE "homepage_stat_mode" AS ENUM ('auto', 'pinned', 'held');

-- CreateTable
CREATE TABLE "testimonials" (
    "id" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "author_role" TEXT,
    "society_id" TEXT,
    "place" TEXT,
    "status" "testimonial_status" NOT NULL DEFAULT 'pending',
    "source" "testimonial_source" NOT NULL,
    "submitted_by_profile_id" TEXT,
    "consent_at" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_society_stats" (
    "society_id" TEXT NOT NULL,
    "mode" "homepage_stat_mode" NOT NULL DEFAULT 'auto',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "updated_by_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_society_stats_pkey" PRIMARY KEY ("society_id")
);

-- CreateIndex
CREATE INDEX "testimonials_status_priority_idx" ON "testimonials"("status", "priority");

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homepage_society_stats" ADD CONSTRAINT "homepage_society_stats_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The three testimonials the earlier homepage carried, moved here so the back
-- office decides what shows (2026-11-25, user-asked). They name no real
-- person or society, so they arrive HELD — nothing shows until published.
INSERT INTO "testimonials" ("id", "quote", "author_name", "place", "status", "source", "priority", "updated_at") VALUES
 ('tm-import-1', 'Our common-area electricity bill dropped noticeably within the first billing cycle, and we can see exactly where the saving comes from.', 'RWA office-bearer', 'Gurugram', 'held', 'imported', 10, CURRENT_TIMESTAMP),
 ('tm-import-2', 'No upfront cost, no hardware to manage ourselves — FirsThing installed it and we just watch the bill.', 'Facility manager', 'Noida', 'held', 'imported', 20, CURRENT_TIMESTAMP),
 ('tm-import-3', 'What won us over was that the savings are measured, not promised — we could see the readings behind the number.', 'Committee member', 'Bengaluru', 'held', 'imported', 30, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
