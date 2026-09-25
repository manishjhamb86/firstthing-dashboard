-- CreateTable
CREATE TABLE "facility_management_companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "gstin" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_management_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "society_fm_engagements" (
    "id" TEXT NOT NULL,
    "society_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "started_on" TIMESTAMP(3) NOT NULL,
    "ended_on" TIMESTAMP(3),
    "end_reason" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "society_fm_engagements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fm_employments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "person_name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "designation" TEXT,
    "started_on" TIMESTAMP(3) NOT NULL,
    "ended_on" TIMESTAMP(3),
    "end_reason" TEXT,
    "society_member_id" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fm_employments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facility_management_companies_name_key_key" ON "facility_management_companies"("name_key");

-- CreateIndex
CREATE INDEX "society_fm_engagements_society_id_idx" ON "society_fm_engagements"("society_id");

-- CreateIndex
CREATE INDEX "society_fm_engagements_company_id_idx" ON "society_fm_engagements"("company_id");

-- CreateIndex
CREATE INDEX "fm_employments_company_id_idx" ON "fm_employments"("company_id");

-- CreateIndex
CREATE INDEX "fm_employments_mobile_idx" ON "fm_employments"("mobile");

-- CreateIndex
CREATE INDEX "fm_employments_society_member_id_idx" ON "fm_employments"("society_member_id");

-- AddForeignKey
ALTER TABLE "facility_management_companies" ADD CONSTRAINT "facility_management_companies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "society_fm_engagements" ADD CONSTRAINT "society_fm_engagements_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "society_fm_engagements" ADD CONSTRAINT "society_fm_engagements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "facility_management_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "society_fm_engagements" ADD CONSTRAINT "society_fm_engagements_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fm_employments" ADD CONSTRAINT "fm_employments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "facility_management_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fm_employments" ADD CONSTRAINT "fm_employments_society_member_id_fkey" FOREIGN KEY ("society_member_id") REFERENCES "society_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fm_employments" ADD CONSTRAINT "fm_employments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One current company per society, one current employer per person.
CREATE UNIQUE INDEX "society_fm_engagements_one_open" ON "society_fm_engagements"("society_id") WHERE "ended_on" IS NULL;
CREATE UNIQUE INDEX "fm_employments_one_open" ON "fm_employments"("mobile") WHERE "ended_on" IS NULL;
