-- Per-demo commissioning, data (2026-09-26).
--
-- 1. The demo data typed straight into the database for the imported (bf-)
--    societies is cleared: their demos, demo readings, demo reports and the
--    "backfilled" flag. Their circuits, figures, contracts, invoices, meter
--    history and readings stay — the figures read "agreed, demo pending
--    re-entry" until a demo is redone in the app and accepted.
-- 2. Every circuit commissioned in the app gets its commissioning moved onto
--    demo 1: meter, load test, replacement, the pre/post periods, the days in
--    those periods, and an accepted set wherever the old model had settled a
--    figure. The periods are chosen so the accepted sets reproduce the stored
--    baseline and benchmark (checked against stage before writing this).
-- 3. Gate passes, replacement days, reviews and demo reports point at their
--    demo; monitoring rows say where they came from; meter caches follow the
--    open history entry.

-- ── 1. Imported demo data ──────────────────────────────────────────────────
UPDATE offers SET demo_report_id = NULL WHERE demo_report_id LIKE 'bf-%';
DELETE FROM demo_result_reviews WHERE circuit_id LIKE 'bf-%';
DELETE FROM demo_reports WHERE id LIKE 'bf-%';
DELETE FROM circuit_demos WHERE id LIKE 'bf-%';
UPDATE circuits SET eligibility_checklist = eligibility_checklist - 'backfilled'
 WHERE id LIKE 'bf-%' AND eligibility_checklist ? 'backfilled';

-- ── 2. App circuits → demo 1 ───────────────────────────────────────────────
DROP TABLE IF EXISTS mig_c;
CREATE TEMP TABLE mig_c AS
SELECT c.id,
       c.meter_installed_at::date AS mi,
       c.light_replacement_date::date AS lr,
       c.pre_install_baseline AS base,
       c.benchmark_savings_pct AS bench,
       c.pre_demo_from::date AS pdf, c.pre_demo_to::date AS pdt,
       c.post_demo_from::date AS qdf, c.post_demo_to::date AS qdt,
       (SELECT coalesce(cc.billing_start_date::date, k.term_start::date)
          FROM site_surveys s
          JOIN contracts k ON k.pipeline_id = s.pipeline_id AND k.status <> 'draft'
          LEFT JOIN installation_projects p ON p.pipeline_id = s.pipeline_id
          LEFT JOIN completion_certificates cc ON cc.project_id = p.id
         WHERE s.id = c.site_survey_id LIMIT 1) AS bs,
       (SELECT max(r.date)::date FROM meter_readings r WHERE r.circuit_id = c.id) AS maxr,
       (SELECT d.id FROM circuit_demos d WHERE d.circuit_id = c.id ORDER BY d.sequence LIMIT 1) AS old_demo,
       (SELECT i.id FROM meter_installations i
         WHERE i.circuit_id = c.id AND i.installed_at::date <= c.meter_installed_at::date + 1
           AND (i.removed_at IS NULL OR i.removed_at::date > c.meter_installed_at::date)
         ORDER BY i.installed_at DESC LIMIT 1) AS stay
  FROM circuits c
 WHERE c.id NOT LIKE 'bf-%' AND c.voided_at IS NULL AND c.meter_installed_at IS NOT NULL;

ALTER TABLE mig_c ADD COLUMN meter TEXT, ADD COLUMN demo TEXT,
  ADD COLUMN pf DATE, ADD COLUMN pt DATE, ADD COLUMN qf DATE, ADD COLUMN qt DATE;

UPDATE mig_c m SET
  meter = coalesce((SELECT i.meter_id FROM meter_installations i WHERE i.id = m.stay),
                   (SELECT d.id FROM meter_devices d WHERE d.circuit_id = m.id LIMIT 1)),
  demo = coalesce(m.old_demo, 'dm-' || m.id),
  pf = coalesce(m.pdf, m.mi + 1),
  pt = coalesce(m.pdt, m.lr - 1, m.maxr),
  qf = CASE WHEN m.lr IS NOT NULL THEN coalesce(m.qdf, m.lr + 1) END;

-- The post period ends where the stored benchmark was measured: the first
-- day whose running mean reproduces it. Otherwise the day before billing
-- starts, or the last reading.
UPDATE mig_c m SET qt = coalesce(m.qdt,
  (SELECT min(x.d) FROM (
     SELECT r.date::date AS d,
            100 * (1 - avg(r.kwh) OVER (ORDER BY r.date) / nullif(pre.a, 0)) AS pct
       FROM meter_readings r,
            LATERAL (SELECT avg(a.kwh) AS a FROM meter_readings a
                      WHERE a.circuit_id = m.id AND a.excluded_at IS NULL
                        AND a.date::date BETWEEN m.pf AND m.pt) pre
      WHERE r.circuit_id = m.id AND r.excluded_at IS NULL AND r.date::date >= m.qf) x
    WHERE m.bench IS NOT NULL AND abs(x.pct - m.bench) < 0.0005),
  CASE WHEN m.bs IS NOT NULL AND m.bs - 1 >= m.qf THEN least(m.maxr, m.bs - 1) ELSE m.maxr END)
 WHERE m.qf IS NOT NULL;

-- A post period that ends before it starts has no days.
UPDATE mig_c SET qt = NULL WHERE qt IS NOT NULL AND qt < qf;
UPDATE mig_c SET pt = NULL WHERE pt IS NOT NULL AND pt < pf;

-- Existing demo (an aggregate-only paper demo): it becomes demo 1's record.
UPDATE circuit_demos d SET
  meter_id = m.meter,
  meter_installation_id = m.stay,
  meter_skipped = (m.meter IS NULL),
  meter_installed_at = c.meter_installed_at,
  meter_displayed_load = c.meter_displayed_load,
  load_discrepancy_pct = c.load_discrepancy_pct,
  load_validation_override_by_id = c.load_validation_override_by_id,
  load_validation_override_reason = c.load_validation_override_reason,
  pre_from = m.pf::timestamp, pre_to = m.pt::timestamp,
  post_from = m.qf::timestamp, post_to = m.qt::timestamp,
  replacement_owner_id = c.replacement_owner_id,
  replacement_assigned_at = c.replacement_assigned_at,
  replacement_assigned_by_id = c.replacement_assigned_by_id,
  light_replacement_date = c.light_replacement_date,
  origin = 'migrated'
  FROM mig_c m JOIN circuits c ON c.id = m.id
 WHERE d.id = m.old_demo;

INSERT INTO circuit_demos (id, circuit_id, sequence, metered_light_count,
  meter_id, meter_installation_id, meter_skipped, meter_installed_at, meter_displayed_load,
  load_discrepancy_pct, load_validation_override_by_id, load_validation_override_reason,
  pre_from, pre_to, post_from, post_to,
  replacement_owner_id, replacement_assigned_at, replacement_assigned_by_id, light_replacement_date,
  origin, created_at, updated_at)
SELECT m.demo, c.id, 1, c.metered_light_count,
  m.meter, m.stay, (m.meter IS NULL), c.meter_installed_at, c.meter_displayed_load,
  c.load_discrepancy_pct, c.load_validation_override_by_id, c.load_validation_override_reason,
  m.pf::timestamp, m.pt::timestamp, m.qf::timestamp, m.qt::timestamp,
  c.replacement_owner_id, c.replacement_assigned_at, c.replacement_assigned_by_id, c.light_replacement_date,
  'migrated', c.created_at, now()
  FROM mig_c m JOIN circuits c ON c.id = m.id
 WHERE m.old_demo IS NULL;

-- The days in each period move to the demo's own table.
INSERT INTO circuit_demo_readings (id, demo_id, date, kwh, phase, source, meter_kwh, meter_id,
  hours_covered, data_hours, raw_file_id, excluded_at, excluded_by_id, excluded_reason, updated_at)
SELECT 'dr-' || r.id, m.demo, r.date::date, r.kwh,
       CASE WHEN r.date::date BETWEEN m.pf AND m.pt THEN 'pre' ELSE 'post' END,
       (CASE WHEN f.s3_key LIKE 'demo-generated/%' THEN 'demo_generated'
             WHEN r.meter_id IS NOT NULL THEN 'meter' ELSE 'migrated' END)::demo_reading_source,
       CASE WHEN r.meter_id IS NOT NULL THEN r.kwh END, r.meter_id,
       r.interval_count, r.interval_count, r.raw_file_id,
       r.excluded_at, r.excluded_by_id, r.excluded_reason, now()
  FROM meter_readings r
  JOIN mig_c m ON m.id = r.circuit_id
  LEFT JOIN raw_reading_files f ON f.id = r.raw_file_id
 WHERE (m.pt IS NOT NULL AND r.date::date BETWEEN m.pf AND m.pt)
    OR (m.qt IS NOT NULL AND r.date::date BETWEEN m.qf AND m.qt);

-- Accepted sets, wherever the old model had settled the figure. An aggregate
-- paper demo keeps its recorded averages (its benchmark is what was agreed).
INSERT INTO circuit_demo_acceptances (id, demo_id, phase, version, days, average_kwh, counted_days, accepted_at)
SELECT 'da-' || m.demo || '-' || ph.phase, m.demo, ph.phase, 1,
       coalesce((SELECT jsonb_agg(jsonb_build_object('date', to_char(x.date, 'YYYY-MM-DD'), 'kWh', x.kwh, 'source', x.source::text,
                                                     'excluded', x.excluded_at IS NOT NULL) ORDER BY x.date)
                   FROM circuit_demo_readings x WHERE x.demo_id = m.demo AND x.phase = ph.phase), '[]'::jsonb),
       CASE WHEN d.pre_install_baseline IS NOT NULL AND d.id = m.old_demo
            THEN CASE ph.phase WHEN 'pre' THEN d.pre_install_baseline ELSE d.post_install_average END
            ELSE (SELECT avg(x.kwh) FROM circuit_demo_readings x
                   WHERE x.demo_id = m.demo AND x.phase = ph.phase AND x.excluded_at IS NULL) END,
       (SELECT count(*) FROM circuit_demo_readings x
         WHERE x.demo_id = m.demo AND x.phase = ph.phase AND x.excluded_at IS NULL)::int,
       now()
  FROM mig_c m
  JOIN circuit_demos d ON d.id = m.demo
 CROSS JOIN (VALUES ('pre'), ('post')) AS ph(phase)
 WHERE (ph.phase = 'pre'  AND (m.base IS NOT NULL OR d.pre_install_baseline IS NOT NULL))
    OR (ph.phase = 'post' AND (m.bench IS NOT NULL OR d.post_install_average IS NOT NULL));

-- An acceptance with nothing to average is not an acceptance.
DELETE FROM circuit_demo_acceptances WHERE id LIKE 'da-%' AND average_kwh IS NULL;

-- ── 3. Pointers ────────────────────────────────────────────────────────────
UPDATE gate_passes g SET demo_id = m.demo FROM mig_c m WHERE g.circuit_id = m.id AND g.demo_id IS NULL;
UPDATE scheduled_events e SET demo_id = m.demo FROM mig_c m
 WHERE e.circuit_id = m.id AND e.kind = 'installation_day' AND e.demo_id IS NULL;
UPDATE demo_result_reviews v SET demo_id = m.demo FROM mig_c m WHERE v.circuit_id = m.id AND v.demo_id IS NULL;

UPDATE demo_reports r SET demo_ids = ARRAY(
  SELECT d.id FROM circuit_demos d
    JOIN circuits c ON c.id = d.circuit_id
    JOIN site_surveys s ON s.id = c.site_survey_id
   WHERE s.pipeline_id = r.pipeline_id AND NOT d.rejected AND c.voided_at IS NULL
   ORDER BY d.id);

-- Moved days leave the monitoring table unless monitoring has started for them.
DELETE FROM meter_readings r USING mig_c m
 WHERE r.circuit_id = m.id AND r.used_in_calculation_id IS NULL
   AND (m.bs IS NULL OR r.date::date < m.bs)
   AND ((m.pt IS NOT NULL AND r.date::date BETWEEN m.pf AND m.pt)
     OR (m.qt IS NOT NULL AND r.date::date BETWEEN m.qf AND m.qt));

UPDATE meter_readings r SET origin = CASE
    WHEN r.meter_id IS NOT NULL THEN 'meter'::reading_origin
    WHEN f.period IS NOT NULL THEN 'monthly_upload'::reading_origin
    ELSE 'legacy'::reading_origin END
  FROM raw_reading_files f WHERE f.id = r.raw_file_id;

-- The meter's circuit and society are a cache of its open history entry.
UPDATE meter_devices SET circuit_id = NULL
 WHERE circuit_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM meter_installations i
                    WHERE i.meter_id = meter_devices.id AND i.removed_at IS NULL
                      AND i.circuit_id = meter_devices.circuit_id);
UPDATE meter_devices d SET circuit_id = i.circuit_id, society_id = i.society_id
  FROM meter_installations i
 WHERE i.meter_id = d.id AND i.removed_at IS NULL
   AND (d.circuit_id IS DISTINCT FROM i.circuit_id OR d.society_id IS DISTINCT FROM i.society_id);

DROP TABLE mig_c;
