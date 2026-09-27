-- The stored represented count becomes the FULL INSTALLATION (2026-09-27,
-- user-specified): the demo lights were installed before the full
-- installation and are not part of it, but every count entered so far
-- included them. Take them off every circuit, once.
--
-- Demo lights = the initial (first live) demo's light count — the circuit's
-- metered count when the demo was on paper — capped at the lights actually
-- replaced on the circuit (fixtures kept were never installed by FirsThing).
-- The same rule as demoLightsInstalled() in src/lib/light-population.ts.
--
-- Every change gets its own audit row, and nothing billed is restated: fee
-- lines, offers and demo reports keep the figures they were made on.

WITH demo AS (
  SELECT c.id,
         c.represented_light_count AS represented,
         COALESCE(
           (SELECT d.metered_light_count FROM circuit_demos d
             WHERE d.circuit_id = c.id AND d.voided_at IS NULL
             ORDER BY d.sequence ASC LIMIT 1),
           c.metered_light_count
         ) AS demo_count,
         (SELECT SUM(COALESCE(v.replacement_count, v.count)) FROM circuit_devices v
           WHERE v.circuit_id = c.id AND NOT v.excluded_from_calculation) AS replaced
    FROM circuits c
),
split AS (
  SELECT id, represented,
         GREATEST(0, CASE WHEN replaced IS NULL OR replaced = 0 THEN demo_count ELSE LEAST(demo_count, replaced) END) AS demo_lights
    FROM demo
),
changed AS (
  SELECT id, represented, demo_lights, GREATEST(0, represented - demo_lights) AS full_installation
    FROM split
   WHERE demo_lights > 0
),
audit AS (
  INSERT INTO represented_count_changes (id, circuit_id, previous_count, next_count, effective_from, reason, recorded_by_id, recorded_at)
  SELECT 'split-' || id, id, represented, full_installation, '2026-09',
         'The stored count now means the full installation, not counting the ' || demo_lights ||
         ' demo lights installed before it. Nothing about the lights changed: ' || represented ||
         ' = ' || full_installation || ' full installation + ' || demo_lights || ' demo.',
         'sys-data-import', NOW()
    FROM changed
  RETURNING circuit_id
)
UPDATE circuits c
   SET represented_light_count = ch.full_installation
  FROM changed ch
 WHERE c.id = ch.id;
