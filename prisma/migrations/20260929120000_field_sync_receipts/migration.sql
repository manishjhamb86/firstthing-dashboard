-- CreateTable
CREATE TABLE "field_sync_receipts" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_sync_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_sync_receipts_actor_id_idx" ON "field_sync_receipts"("actor_id");

-- AddForeignKey
ALTER TABLE "field_sync_receipts" ADD CONSTRAINT "field_sync_receipts_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

