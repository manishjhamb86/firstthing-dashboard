-- AlterTable
ALTER TABLE "invoice_intakes" ADD COLUMN     "file_hash" TEXT;

-- CreateIndex
CREATE INDEX "invoice_intakes_file_hash_idx" ON "invoice_intakes"("file_hash");

