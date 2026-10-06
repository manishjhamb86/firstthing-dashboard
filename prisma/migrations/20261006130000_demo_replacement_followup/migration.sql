
-- CreateEnum
CREATE TYPE "follow_up_plan" AS ENUM ('field_revisit', 'society_completes');

-- CreateTable
CREATE TABLE "demo_replacement_follow_ups" (
    "id" TEXT NOT NULL,
    "demo_id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "remaining" JSONB NOT NULL,
    "plan" "follow_up_plan" NOT NULL,
    "reason" TEXT NOT NULL,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raised_by_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "completed_by_profile_id" TEXT,
    "completed_by_admin_id" TEXT,
    "completion_note" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "demo_replacement_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demo_replacement_follow_ups_circuit_id_idx" ON "demo_replacement_follow_ups"("circuit_id");

-- CreateIndex
CREATE INDEX "demo_replacement_follow_ups_society_id_completed_at_idx" ON "demo_replacement_follow_ups"("society_id", "completed_at");

-- AddForeignKey
ALTER TABLE "demo_replacement_follow_ups" ADD CONSTRAINT "demo_replacement_follow_ups_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "circuit_demos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_replacement_follow_ups" ADD CONSTRAINT "demo_replacement_follow_ups_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_replacement_follow_ups" ADD CONSTRAINT "demo_replacement_follow_ups_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_replacement_follow_ups" ADD CONSTRAINT "demo_replacement_follow_ups_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_replacement_follow_ups" ADD CONSTRAINT "demo_replacement_follow_ups_completed_by_profile_id_fkey" FOREIGN KEY ("completed_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_replacement_follow_ups" ADD CONSTRAINT "demo_replacement_follow_ups_completed_by_admin_id_fkey" FOREIGN KEY ("completed_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

