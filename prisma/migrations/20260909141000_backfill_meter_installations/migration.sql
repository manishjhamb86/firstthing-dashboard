-- One open stay per meter already bound to a circuit, so nothing that works
-- today changes meaning.
--
-- The start is NOT `assigned_at`. That column records when somebody bound the
-- meter in this system, not when it physically went in: on stage every meter
-- was bound in Aug/Sep 2026 while its hourly history runs back to February,
-- and 102,633 hourly rows predate their own `assigned_at`. Opening the
-- interval there would have silently un-attributed six months of readings for
-- nearly every society — the projection would stop producing them and the
-- baselines behind live benchmarks would move.
--
-- So the interval opens at the EARLIEST EVIDENCE the meter holds, and says so:
-- `start_inferred` marks a start that was derived rather than recorded, and
-- the screen reads it as "since its earliest reading" instead of presenting a
-- guess as a stated installation date. This is the user's own instruction for
-- the existing data — "for old history we can ignore this and keep the data as
-- it is, linked to the single society it is currently attached to".
INSERT INTO "meter_installations"
  ("id", "meter_id", "circuit_id", "society_id", "installed_at", "removed_at",
   "start_inferred", "installed_by_id", "created_at")
SELECT
  'mi-' || m."id",
  m."id",
  m."circuit_id",
  c."society_id",
  LEAST(
    COALESCE((SELECT MIN(h."day") FROM "meter_hourly_readings" h WHERE h."meter_id" = m."id"),
             COALESCE(m."assigned_at", m."created_at")),
    COALESCE(m."assigned_at", m."created_at")
  ),
  NULL,
  true,
  m."assigned_by_id",
  CURRENT_TIMESTAMP
FROM "meter_devices" m
JOIN "circuits" c ON c."id" = m."circuit_id"
WHERE m."circuit_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "meter_installations" i WHERE i."meter_id" = m."id");

-- Every billing-grade day already projected keeps the meter that produced it.
-- One meter per circuit has held until now, so this attribution is exact
-- rather than inferred.
UPDATE "meter_readings" r
   SET "meter_id" = m."id"
  FROM "meter_devices" m
 WHERE m."circuit_id" = r."circuit_id"
   AND r."meter_id" IS NULL;
