-- One pre-system society, from `prospect` to a live contract.
--
-- This is the template the generated per-society scripts follow. Everything
-- between BEGIN and COMMIT is one transaction: a society lands complete or
-- not at all, because a half-onboarded society is worse than an untouched one.
--
-- The :variables are filled from the three CSVs. Values shown here are Ace
-- City's, so the file can be run as-is against a scratch database to check
-- the chain still matches the schema.
--
-- Deterministic ids throughout. Re-running is refused by the primary keys
-- rather than silently duplicating, and any row traces back to its CSV line.

\set soc            'ace-city'
-- The account credited with the backfill. NOTE: psql's \set takes the whole
-- rest of the line as the value, so a trailing comment would become part of it.
\set actor          'yogesh@firsthing.earth'
\set contact_name   'Ace City AOA'
\set contact_phone  '9999999999'
\set signed_on      '2025-10-23'
\set term_start     '2025-11-01'
\set term_months    36
\set society_share  64.0
\set tolerance      10
\set unit_rate      6.3
\set monthly_fee    54214
\set agreed_savings 66.4

BEGIN;

-- 0. The society exists already; onboarding makes it active.
UPDATE societies SET status = 'active' WHERE id = :'soc';

-- 1. Engaged on the service line. This is what "Lighting · Not enrolled"
--    reads off, and it is the same fact as the deal existing.
INSERT INTO engagements (id, society_id, service_line, status, created_at)
VALUES (:'soc' || '-eng-lighting', :'soc', 'lighting', 'active', now());

-- 2. The deal. `authoritative` because nobody is waiting to approve a deal
--    that was signed years ago; `meeting_date` is the signature date, and the
--    note says so rather than implying a meeting anyone attended.
INSERT INTO pipelines (
  id, society_id, service_line, stage, contact_name, contact_phone,
  meeting_date, sales_owner_id, logged_by_id, authoritative, notes,
  created_at, updated_at)
SELECT :'soc' || '-pipe-lighting', :'soc', 'lighting', 'active_billing',
       :'contact_name', :'contact_phone', :'signed_on'::date,
       a.id, a.id, true,
       'Backfilled from the signed agreement and the post-installation savings report. '
       'This deal predates the system: the date above is the agreement signature, not a meeting.',
       now(), now()
FROM admin_users a WHERE a.email = :'actor';

-- 3. Circuits hang off a survey (CON-24), so one exists even though no
--    survey was ever run.
INSERT INTO site_surveys (id, pipeline_id, created_at)
VALUES (:'soc' || '-survey', :'soc' || '-pipe-lighting', now());

-- 4. One row per metered circuit — repeated per row of circuits.csv.
--    `state='benchmark_confirmed'` is the end of commissioning: the demo
--    happened, the figures are the report's. `eligibility_checklist` records
--    that CON-16 was never assessed and why, so the circuit page says so
--    instead of offering a survey that does not exist.
INSERT INTO circuits (
  id, society_id, site_survey_id, service_line, light_type,
  metered_light_count, represented_light_count, wattage, working_hours,
  state, location, meter_installed_at, light_replacement_date,
  pre_install_baseline, benchmark_savings_pct, eligibility_checklist,
  created_by_id, created_at)
SELECT :'soc' || '-ckt-1', :'soc', :'soc' || '-survey', 'lighting', 'basement',
       96, 2508, 20, 24,
       'benchmark_confirmed', 'Basement', '2025-08-01'::date, '2025-08-11'::date,
       48.70, 66.40,
       jsonb_build_object(
         'backfilled', true,
         'source', 'ACE CITY - Energy Consumption Analysis and Recommendation Report After Demo.pdf',
         'note', 'Commissioned before this system existed — CON-16 eligibility was never assessed.'),
       a.id, now()
FROM admin_users a WHERE a.email = :'actor';

-- 5. The load inventory — one row per fixture line (circuit_devices.csv).
--    `historical` marks it as read off paper rather than captured on site;
--    `excluded_from_calculation` is the shared fixture whose load comes off
--    both sides of the savings figure.
INSERT INTO circuit_devices (
  id, circuit_id, device_type_id, count, wattage, hours_per_day,
  excluded_from_calculation, historical, historical_note, recorded_by_id, created_at)
SELECT :'soc' || '-ckt-1-dev-1', :'soc' || '-ckt-1', d.id, 96, 20, 24,
       false, true, 'Read from the post-installation savings report', a.id, now()
FROM device_types d, admin_users a
WHERE d.name = 'Tube light 20W' AND d.role = 'original' AND d.deleted_at IS NULL
  AND a.email = :'actor';

-- 5b. The demo report. Not strictly needed for billing, but without it the
--     deal map sits at "Demo savings report · In progress" forever while the
--     steps after it read Completed — a map that disagrees with itself.
--     CON-11: measured on the demo circuits, extrapolated society-wide by the
--     ratio of represented to metered lights.
INSERT INTO demo_reports (
  id, pipeline_id, version, status,
  pre_install_baseline_total, post_install_average_total, measured_savings_pct,
  society_light_count, metered_light_count, extrapolation_factor,
  projected_savings_kwh_per_day, circuit_snapshot, generated_at, shared_at, shared_by_id)
SELECT :'soc' || '-demo-report-1', :'soc' || '-pipe-lighting', 1, 'shared',
       c.pre_install_baseline,
       c.pre_install_baseline * (1 - c.benchmark_savings_pct / 100),
       c.benchmark_savings_pct,
       c.represented_light_count, c.metered_light_count,
       c.represented_light_count::double precision / c.metered_light_count,
       (c.pre_install_baseline * c.benchmark_savings_pct / 100)
         * (c.represented_light_count::double precision / c.metered_light_count),
       jsonb_build_array(jsonb_build_object(
         'circuitId', c.id, 'lightType', c.light_type, 'location', c.location,
         'meteredLightCount', c.metered_light_count,
         'representedLightCount', c.represented_light_count,
         'benchmarkSavingsPct', c.benchmark_savings_pct,
         'preInstallBaseline', c.pre_install_baseline)),
       now(), :'signed_on'::date, p.id
FROM circuits c
LEFT JOIN profiles p
  ON p.society_id = :'soc' AND p.portal_authority = 'office_bearer' AND p.is_active
WHERE c.id = :'soc' || '-ckt-1';

-- 6. The offer, already accepted. Every figure is the agreement's.
--    `circuit_terms` is built from circuits.csv, not typed.
INSERT INTO offers (
  id, pipeline_id, version, status, benchmark_source, circuit_terms,
  tolerance_pct, revenue_share_pct, unit_electricity_rate, term_months,
  projected_monthly_fee, issued_at, issued_by_id, responded_at, responded_by_id,
  created_at)
SELECT :'soc' || '-offer-1', :'soc' || '-pipe-lighting', 1, 'accepted', 'negotiated_fixed',
       jsonb_build_array(jsonb_build_object(
         'circuitId', :'soc' || '-ckt-1', 'lightType', 'basement', 'location', 'Basement',
         'meteredLightCount', 96, 'representedLightCount', 2508,
         'benchmarkSavingsPct', 66.40, 'preInstallBaseline', 48.70,
         'projectedSavedKwhPerDay', round((48.70 * 66.40 / 100)::numeric, 4))),
       :tolerance, :society_share, :unit_rate, :term_months, :monthly_fee,
       -- Issued by us, responded to by THEM: `responded_by_id` points at
       -- `profiles`, because accepting an offer is the society's act (GATE-04).
       -- Left null when the society has no office-bearer account yet, rather
       -- than crediting the acceptance to an internal user.
       :'signed_on'::date, a.id, :'signed_on'::date, p.id, now()
FROM admin_users a
LEFT JOIN profiles p
  ON p.society_id = :'soc' AND p.portal_authority = 'office_bearer' AND p.is_active
WHERE a.email = :'actor';

-- 7. The executed agreement. Printed/notarised are left null: this system did
--    not witness them, and stamping dates on acts nobody recorded is inventing
--    history. The signature date is what the document states.
INSERT INTO agreements (
  id, pipeline_id, offer_id, prepared_at, prepared_by_id, signed_at)
SELECT :'soc' || '-agreement', :'soc' || '-pipe-lighting', :'soc' || '-offer-1',
       :'signed_on'::date, a.id, :'signed_on'::date
FROM admin_users a WHERE a.email = :'actor';

-- 8. The contract. CON-22: the term runs from the day installation finished
--    and the society approved it — the operator's own record, not the
--    agreement's signature date.
INSERT INTO contracts (
  id, pipeline_id, society_id, service_line, agreement_id, status,
  term_start, term_end, activated_at, activated_by_id, created_at)
SELECT :'soc' || '-contract', :'soc' || '-pipe-lighting', :'soc', 'lighting',
       :'soc' || '-agreement', 'active',
       :'term_start'::date,
       (:'term_start'::date + (:term_months || ' months')::interval),
       :'term_start'::date, a.id, now()
FROM admin_users a WHERE a.email = :'actor';

-- 9. The terms in force from day one. An amendment later becomes version 2
--    and applies forward only (ADR-005); this one is never edited.
INSERT INTO contract_term_versions (
  id, contract_id, version, effective_from, benchmark_source,
  tolerance_pct, revenue_share_pct, unit_electricity_rate,
  circuit_benchmarks, recorded_by_id, recorded_at)
SELECT :'soc' || '-terms-1', :'soc' || '-contract', 1, :'term_start'::date, 'negotiated_fixed',
       :tolerance, :society_share, :unit_rate,
       o.circuit_terms, a.id, now()
FROM offers o, admin_users a
WHERE o.id = :'soc' || '-offer-1' AND a.email = :'actor';

COMMIT;
