
-- CreateTable
CREATE TABLE "operations_flags" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "allow_live_demo_count_correction" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operations_flags_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "operations_flags" ADD CONSTRAINT "operations_flags_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
