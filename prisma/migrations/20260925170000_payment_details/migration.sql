-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('bank_transfer', 'upi', 'cheque', 'cash', 'other');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "cheque_bank" TEXT,
ADD COLUMN     "cheque_date" TIMESTAMP(3),
ADD COLUMN     "cheque_number" TEXT,
ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'bank_transfer',
ADD COLUMN     "tds_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "tds_rate_pct" DOUBLE PRECISION,
ADD COLUMN     "utr_number" TEXT;

