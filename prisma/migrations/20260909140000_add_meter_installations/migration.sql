-- Meters get reused: pulled from one society, installed in another, renamed on
-- the way. Researched 2026-09-09 — the industry separates the permanent
-- metering point (CIM UsagePoint, UK MPAN, NEM NMI) from the movable meter
-- asset, and links them with an effective-dated install/remove interval. This
-- is that interval table; `Circuit` is our metering point.
CREATE TABLE "meter_installations" (
  "id"              TEXT NOT NULL,
  "meter_id"        TEXT NOT NULL,
  "circuit_id"      TEXT NOT NULL,
  "society_id"      TEXT NOT NULL,
  "installed_at"    TIMESTAMP(3) NOT NULL,
  "removed_at"      TIMESTAMP(3),
  "start_inferred"  BOOLEAN NOT NULL DEFAULT false,
  "installed_by_id" TEXT,
  "removed_by_id"   TEXT,
  "removal_note"    TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meter_installations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meter_installations_meter_id_installed_at_idx" ON "meter_installations"("meter_id", "installed_at");
CREATE INDEX "meter_installations_circuit_id_installed_at_idx" ON "meter_installations"("circuit_id", "installed_at");
CREATE INDEX "meter_installations_society_id_idx" ON "meter_installations"("society_id");

-- A meter is in one place at a time, and a circuit is measured by one meter at
-- a time. The UK rule is narrower (it forbids two instances of the SAME meter
-- serial on one point, and an MPAN may legitimately hold several meters), but
-- CON-11 makes the circuit the billing grain and two meters on one circuit
-- would be two sources for one billed figure INV-02 cannot resolve — so this
-- build keeps the stricter rule, deliberately. Enforced in the database rather
-- than in the action: two concurrent assignments both find nothing and both
-- insert.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "meter_installations"
  ADD CONSTRAINT "meter_installations_no_overlap_per_meter"
  EXCLUDE USING gist (
    "meter_id" WITH =,
    tsrange("installed_at", "removed_at") WITH &&
  );
ALTER TABLE "meter_installations"
  ADD CONSTRAINT "meter_installations_no_overlap_per_circuit"
  EXCLUDE USING gist (
    "circuit_id" WITH =,
    tsrange("installed_at", "removed_at") WITH &&
  );

ALTER TABLE "meter_installations" ADD CONSTRAINT "meter_installations_meter_id_fkey"
  FOREIGN KEY ("meter_id") REFERENCES "meter_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meter_installations" ADD CONSTRAINT "meter_installations_circuit_id_fkey"
  FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meter_installations" ADD CONSTRAINT "meter_installations_society_id_fkey"
  FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meter_installations" ADD CONSTRAINT "meter_installations_installed_by_id_fkey"
  FOREIGN KEY ("installed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meter_installations" ADD CONSTRAINT "meter_installations_removed_by_id_fkey"
  FOREIGN KEY ("removed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The billing-grade reading keeps WHICH meter produced it, alongside the
-- circuit it was attributed to — the NEM's own record carries both the NMI and
-- the MeterSerialNumber, for the same reason.
ALTER TABLE "meter_readings" ADD COLUMN "meter_id" TEXT;
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_meter_id_fkey"
  FOREIGN KEY ("meter_id") REFERENCES "meter_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
