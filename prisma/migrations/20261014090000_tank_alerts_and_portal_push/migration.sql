-- CreateEnum
CREATE TYPE "TankAlertKind" AS ENUM ('offline', 'level_low', 'level_high');

-- AlterTable
ALTER TABLE "push_subscriptions" ADD COLUMN     "profile_id" TEXT,
ALTER COLUMN "admin_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tank_api_config" ADD COLUMN     "high_level_pct" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "low_level_pct" INTEGER NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "tank_alerts" (
    "id" TEXT NOT NULL,
    "tank_id" TEXT NOT NULL,
    "kind" "TankAlertKind" NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "closed_at" TIMESTAMP(3),
    "closed_reason" TEXT,
    "raise_count" INTEGER NOT NULL DEFAULT 1,
    "reraised_at" TIMESTAMP(3),

    CONSTRAINT "tank_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tank_alerts_tank_id_opened_at_idx" ON "tank_alerts"("tank_id", "opened_at");

-- CreateIndex
CREATE INDEX "tank_alerts_closed_at_idx" ON "tank_alerts"("closed_at");

-- CreateIndex
CREATE INDEX "push_subscriptions_profile_id_idx" ON "push_subscriptions"("profile_id");

-- AddForeignKey
ALTER TABLE "tank_alerts" ADD CONSTRAINT "tank_alerts_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "water_tanks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one subject, always — same shape as meter_alerts_one_subject.
-- A field-app phone subscribes an AdminUser; a portal phone (water-tank
-- alerts, 2026-10-14) subscribes a Profile. Never both, never neither.
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_one_subject"
  CHECK (("admin_id" IS NULL) <> ("profile_id" IS NULL));

-- One OPEN alert per tank per kind — same reasoning and same shape as
-- meter_alerts_open_unique: the half-hourly sampler racing itself must
-- never file the same outage twice.
CREATE UNIQUE INDEX "tank_alerts_open_unique"
  ON "tank_alerts" ("tank_id", "kind")
  WHERE "closed_at" IS NULL;
