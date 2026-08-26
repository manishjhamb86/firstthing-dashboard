-- AlterTable
ALTER TABLE "stored_documents" ADD COLUMN     "content_sha256" TEXT NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "stored_documents_society_id_doc_type_period_version_key" ON "stored_documents"("society_id", "doc_type", "period", "version");

-- AddForeignKey
ALTER TABLE "stored_documents" ADD CONSTRAINT "stored_documents_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

