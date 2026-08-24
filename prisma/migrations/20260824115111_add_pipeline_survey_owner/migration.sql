-- AlterTable
ALTER TABLE "pipelines" ADD COLUMN     "survey_owner_id" TEXT;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_survey_owner_id_fkey" FOREIGN KEY ("survey_owner_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
