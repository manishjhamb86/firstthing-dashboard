-- CreateEnum
CREATE TYPE "StarListingOrigin" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "StarListingStatus" AS ENUM ('proposed', 'approved', 'rejected', 'withdrawn', 'superseded', 'expired');

-- AlterEnum
ALTER TYPE "admin_permission" ADD VALUE 'approve_showcase';

-- CreateTable
CREATE TABLE "showcase_consents" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "given_by" TEXT NOT NULL,
    "given_on" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_id" TEXT,
    "withdrawn_reason" TEXT,

    CONSTRAINT "showcase_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "star_listings" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "origin" "StarListingOrigin" NOT NULL,
    "status" "StarListingStatus" NOT NULL DEFAULT 'proposed',
    "rating_stars" INTEGER,
    "avg_days_late" DOUBLE PRECISION,
    "invoice_count" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "show_summary" BOOLEAN NOT NULL DEFAULT true,
    "proposed_by_id" TEXT,
    "proposed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proposal_note" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "expires_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_id" TEXT,
    "withdrawn_reason" TEXT,

    CONSTRAINT "star_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "showcase_consents_society_id_withdrawn_at_idx" ON "showcase_consents"("society_id", "withdrawn_at");

-- CreateIndex
CREATE INDEX "star_listings_status_expires_at_idx" ON "star_listings"("status", "expires_at");

-- CreateIndex
CREATE INDEX "star_listings_society_id_status_idx" ON "star_listings"("society_id", "status");

-- AddForeignKey
ALTER TABLE "showcase_consents" ADD CONSTRAINT "showcase_consents_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_consents" ADD CONSTRAINT "showcase_consents_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_consents" ADD CONSTRAINT "showcase_consents_withdrawn_by_id_fkey" FOREIGN KEY ("withdrawn_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "star_listings" ADD CONSTRAINT "star_listings_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "star_listings" ADD CONSTRAINT "star_listings_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "star_listings" ADD CONSTRAINT "star_listings_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "star_listings" ADD CONSTRAINT "star_listings_withdrawn_by_id_fkey" FOREIGN KEY ("withdrawn_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one live listing (proposed or approved) per society — enforced
-- here because two admins approving at once would otherwise both insert.
CREATE UNIQUE INDEX "star_listings_live_unique" ON "star_listings"("society_id") WHERE "status" IN ('proposed', 'approved');
