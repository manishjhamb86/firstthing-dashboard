-- CreateEnum
CREATE TYPE "extraction_status" AS ENUM ('pending', 'proposed', 'confirmed', 'failed');

-- CreateTable
CREATE TABLE "document_extractions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "status" "extraction_status" NOT NULL DEFAULT 'pending',
    "proposed" JSONB,
    "confirmed" JSONB,
    "model_error" TEXT,
    "extracted_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_id" TEXT,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_extractions_document_id_key" ON "document_extractions"("document_id");

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "stored_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

