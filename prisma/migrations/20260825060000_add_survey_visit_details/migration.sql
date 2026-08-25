-- AlterTable
ALTER TABLE "pipelines" ADD COLUMN     "survey_assigned_at" TIMESTAMP(3),
ADD COLUMN     "survey_assigned_by_id" TEXT,
ADD COLUMN     "survey_contact_name" TEXT,
ADD COLUMN     "survey_contact_phone" TEXT,
ADD COLUMN     "survey_scheduled_at" TIMESTAMP(3),
ADD COLUMN     "survey_visit_note" TEXT;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_survey_assigned_by_id_fkey" FOREIGN KEY ("survey_assigned_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

