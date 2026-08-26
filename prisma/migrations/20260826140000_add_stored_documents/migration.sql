-- CreateTable
CREATE TABLE "stored_documents" (
    "id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "note" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stored_documents_society_id_doc_type_idx" ON "stored_documents"("society_id", "doc_type");

-- AddForeignKey
ALTER TABLE "stored_documents" ADD CONSTRAINT "stored_documents_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_documents" ADD CONSTRAINT "stored_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

