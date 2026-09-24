-- CreateTable
CREATE TABLE "published_savings_reports" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by_id" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "published_savings_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "published_savings_reports_society_id_idx" ON "published_savings_reports"("society_id");

-- CreateIndex
CREATE UNIQUE INDEX "published_savings_reports_circuit_id_period_version_key" ON "published_savings_reports"("circuit_id", "period", "version");

-- AddForeignKey
ALTER TABLE "published_savings_reports" ADD CONSTRAINT "published_savings_reports_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_savings_reports" ADD CONSTRAINT "published_savings_reports_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_savings_reports" ADD CONSTRAINT "published_savings_reports_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_savings_reports" ADD CONSTRAINT "published_savings_reports_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

