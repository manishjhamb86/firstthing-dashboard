-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'normal', 'high');

-- AlterEnum
ALTER TYPE "ScheduleKind" ADD VALUE 'task';

-- AlterTable
ALTER TABLE "scheduled_events" ADD COLUMN     "all_day" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "completed_by_id" TEXT,
ADD COLUMN     "completion_note" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "priority" "TaskPriority" NOT NULL DEFAULT 'normal',
ALTER COLUMN "society_id" DROP NOT NULL;

