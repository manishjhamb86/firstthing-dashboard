-- AlterTable
ALTER TABLE "benchmark_rescale_events" ADD COLUMN     "corrected_by_event_id" TEXT,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by_id" TEXT;

-- AlterTable
ALTER TABLE "billing_invoices" ADD COLUMN     "payment_status_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "payment_status_confirmed_by_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_rescale_events_corrected_by_event_id_key" ON "benchmark_rescale_events"("corrected_by_event_id");

-- AddForeignKey
ALTER TABLE "benchmark_rescale_events" ADD CONSTRAINT "benchmark_rescale_events_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_rescale_events" ADD CONSTRAINT "benchmark_rescale_events_corrected_by_event_id_fkey" FOREIGN KEY ("corrected_by_event_id") REFERENCES "benchmark_rescale_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_payment_status_confirmed_by_id_fkey" FOREIGN KEY ("payment_status_confirmed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

