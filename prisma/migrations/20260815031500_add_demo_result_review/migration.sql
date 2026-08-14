-- CreateEnum
CREATE TYPE "demo_result_review_state" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "demo_result_resolution" AS ENUM ('rerun_window', 'installation_defect', 'escalate_manual_benchmark');

-- CreateTable
CREATE TABLE "demo_result_reviews" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "occurrence" INTEGER NOT NULL DEFAULT 1,
    "measured_savings_pct" DOUBLE PRECISION NOT NULL,
    "pre_install_baseline" DOUBLE PRECISION NOT NULL,
    "post_install_average" DOUBLE PRECISION NOT NULL,
    "state" "demo_result_review_state" NOT NULL DEFAULT 'open',
    "resolution" "demo_result_resolution",
    "resolution_note" TEXT,
    "load_revalidated_pct" DOUBLE PRECISION,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_result_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demo_result_reviews_state_raised_at_idx" ON "demo_result_reviews"("state", "raised_at");

-- CreateIndex
CREATE INDEX "demo_result_reviews_circuit_id_idx" ON "demo_result_reviews"("circuit_id");

-- AddForeignKey
ALTER TABLE "demo_result_reviews" ADD CONSTRAINT "demo_result_reviews_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_result_reviews" ADD CONSTRAINT "demo_result_reviews_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

