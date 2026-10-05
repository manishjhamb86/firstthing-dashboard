-- AlterTable
ALTER TABLE "scheduled_events" ADD COLUMN     "proof_file_name" TEXT,
ADD COLUMN     "proof_key" TEXT,
ADD COLUMN     "proof_uploaded_at" TIMESTAMP(3),
ADD COLUMN     "proof_uploaded_by_id" TEXT,
ADD COLUMN     "requires_proof" BOOLEAN NOT NULL DEFAULT false;

