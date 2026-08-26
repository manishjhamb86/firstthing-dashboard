-- A device line can share the circuit without being part of the retrofit.
ALTER TABLE "circuit_devices" ADD COLUMN "excluded_from_calculation" BOOLEAN NOT NULL DEFAULT false;
