-- CreateTable
CREATE TABLE "member_positions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "society_members" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "position_id" TEXT NOT NULL,
    "started_on" TIMESTAMP(3),
    "notes" TEXT,
    "ended_on" TIMESTAMP(3),
    "end_reason" TEXT,
    "ended_by_id" TEXT,
    "replaced_by_id" TEXT,
    "profile_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "society_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_positions_name_key_key" ON "member_positions"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "society_members_replaced_by_id_key" ON "society_members"("replaced_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "society_members_profile_id_key" ON "society_members"("profile_id");

-- CreateIndex
CREATE INDEX "society_members_society_id_ended_on_idx" ON "society_members"("society_id", "ended_on");

-- AddForeignKey
ALTER TABLE "society_members" ADD CONSTRAINT "society_members_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "society_members" ADD CONSTRAINT "society_members_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "member_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "society_members" ADD CONSTRAINT "society_members_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "society_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Seed the positions named by the user, plus the usual committee posts.
INSERT INTO "member_positions" ("id", "name", "name_key", "sort_order") VALUES
  ('pos-president', 'President', 'president', 10),
  ('pos-vice-president', 'Vice-president', 'vice president', 20),
  ('pos-secretary', 'Secretary', 'secretary', 30),
  ('pos-treasurer', 'Treasurer', 'treasurer', 40),
  ('pos-aoa-member', 'AOA member', 'aoa member', 50),
  ('pos-technical-manager', 'Technical manager', 'technical manager', 60),
  ('pos-facility-manager', 'Facility manager', 'facility manager', 70),
  ('pos-operator', 'Operator', 'operator', 80)
ON CONFLICT DO NOTHING;
