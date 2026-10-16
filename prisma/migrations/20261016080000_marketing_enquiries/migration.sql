-- CreateTable
CREATE TABLE "marketing_enquiries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organisation" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "interest" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followed_up_at" TIMESTAMP(3),
    "followed_up_by_id" TEXT,
    "followed_up_note" TEXT,

    CONSTRAINT "marketing_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_enquiries_created_at_idx" ON "marketing_enquiries"("created_at");

-- AddForeignKey
ALTER TABLE "marketing_enquiries" ADD CONSTRAINT "marketing_enquiries_followed_up_by_id_fkey" FOREIGN KEY ("followed_up_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
