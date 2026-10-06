-- AlterEnum
ALTER TYPE "MeterAlertKind" ADD VALUE 'demo_pre_variance';
ALTER TYPE "MeterAlertKind" ADD VALUE 'demo_post_variance';
ALTER TYPE "MeterAlertKind" ADD VALUE 'demo_readings_missing';

-- AlterEnum
ALTER TYPE "job_type" ADD VALUE 'demo_monitoring_sweep';
