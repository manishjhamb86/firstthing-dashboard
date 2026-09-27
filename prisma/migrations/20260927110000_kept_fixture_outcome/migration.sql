-- What became of fixtures kept on a demo circuit, recorded at the full
-- installation (2026-09-27). All nullable: null = not recorded.
ALTER TABLE "circuit_devices" ADD COLUMN "kept_replaced_count" INTEGER;
ALTER TABLE "circuit_devices" ADD COLUMN "kept_removed_count" INTEGER;
ALTER TABLE "circuit_devices" ADD COLUMN "kept_recorded_at" TIMESTAMP(3);
ALTER TABLE "circuit_devices" ADD COLUMN "kept_recorded_by_id" TEXT;
