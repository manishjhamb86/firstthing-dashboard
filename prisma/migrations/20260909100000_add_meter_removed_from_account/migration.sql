-- A device deleted from the eWeLink account stayed in the mirror forever,
-- because the sync only ever upserted what it found (user-caught 2026-09-09).
-- Additive and nullable: every existing row is still in the account until a
-- sync says otherwise, and nothing is ever hard-deleted — the row can carry
-- readings a bill was computed from.
ALTER TABLE "meter_devices"
  ADD COLUMN "removed_from_account_at" TIMESTAMP(3);
