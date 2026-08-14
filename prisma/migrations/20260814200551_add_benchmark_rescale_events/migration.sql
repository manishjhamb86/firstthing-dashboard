-- CreateTable
CREATE TABLE "benchmark_rescale_events" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "previous_light_count" INTEGER NOT NULL,
    "new_light_count" INTEGER NOT NULL,
    "previous_baseline" DOUBLE PRECISION NOT NULL,
    "rescaled_baseline" DOUBLE PRECISION NOT NULL,
    "verification_note" TEXT NOT NULL,
    "verification_photo_url" TEXT,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_rescale_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "benchmark_rescale_events_circuit_id_effective_date_idx" ON "benchmark_rescale_events"("circuit_id", "effective_date");

-- AddForeignKey
ALTER TABLE "benchmark_rescale_events" ADD CONSTRAINT "benchmark_rescale_events_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_rescale_events" ADD CONSTRAINT "benchmark_rescale_events_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

