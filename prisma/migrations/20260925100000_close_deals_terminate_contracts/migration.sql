-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "terminated_at" TIMESTAMP(3),
ADD COLUMN     "terminated_by_id" TEXT,
ADD COLUMN     "terminated_on" TIMESTAMP(3),
ADD COLUMN     "termination_reason" TEXT;

-- AlterTable
ALTER TABLE "pipelines" ADD COLUMN     "closed_lost_at" TIMESTAMP(3),
ADD COLUMN     "closed_lost_by_id" TEXT,
ADD COLUMN     "closed_lost_stage" "pipeline_stage";

-- AlterTable
ALTER TABLE "societies" ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "closed_by_id" TEXT,
ADD COLUMN     "closed_reason" TEXT;

