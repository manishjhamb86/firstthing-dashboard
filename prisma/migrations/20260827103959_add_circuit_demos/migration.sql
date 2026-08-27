-- AlterTable
ALTER TABLE "circuits" ADD COLUMN     "benchmark_override_at" TIMESTAMP(3),
ADD COLUMN     "benchmark_override_by_id" TEXT,
ADD COLUMN     "benchmark_override_pct" DOUBLE PRECISION,
ADD COLUMN     "benchmark_override_reason" TEXT;

-- CreateTable
CREATE TABLE "circuit_demos" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "metered_light_count" INTEGER NOT NULL,
    "pre_install_baseline" DOUBLE PRECISION NOT NULL,
    "post_install_average" DOUBLE PRECISION NOT NULL,
    "savings_pct" DOUBLE PRECISION NOT NULL,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "rejection_reason" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circuit_demos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuit_demo_readings" (
    "id" TEXT NOT NULL,
    "demo_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kwh" DOUBLE PRECISION NOT NULL,
    "phase" TEXT NOT NULL,

    CONSTRAINT "circuit_demo_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "circuit_demos_circuit_id_sequence_key" ON "circuit_demos"("circuit_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "circuit_demo_readings_demo_id_date_phase_key" ON "circuit_demo_readings"("demo_id", "date", "phase");

-- AddForeignKey
ALTER TABLE "circuit_demos" ADD CONSTRAINT "circuit_demos_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_demo_readings" ADD CONSTRAINT "circuit_demo_readings_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "circuit_demos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

