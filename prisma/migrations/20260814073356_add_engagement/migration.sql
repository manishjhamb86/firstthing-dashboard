-- CreateEnum
CREATE TYPE "engagement_status" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "engagements" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "service_line" "service_line" NOT NULL,
    "status" "engagement_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "engagements_society_id_service_line_key" ON "engagements"("society_id", "service_line");

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
