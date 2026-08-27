#!/usr/bin/env python3
"""
The three CSVs -> the SQL that onboards those societies.

    python3 scripts/backfill-sql.py [--only "Ace City,Ace Aspire"] > out.sql

Follows docs/backfill/onboard-society.sql, one transaction per society, and
refuses rather than guesses:

  - the society is found BY NAME and must already exist. These 19 were
    imported with their flat counts and portal accounts; inventing a second
    row keyed on a slug would duplicate them.
  - a blank `term_start` means no contract and no term version. The agreement
    and its offer are still recorded, exactly as the app's own
    startContractTerm path leaves them, and the deal stops at `agreed`
    instead of `active_billing`.
  - a blank `location` leaves the stored address alone.
  - only circuits marked `billing=yes` appear in the contract's benchmark
    table.
"""
import csv, json, re, sys
from datetime import date

ROOT = "docs/backfill"
ACTOR = "yogesh@firsthing.earth"

# --migration: emit the same data as a Prisma data migration instead of a
# re-runnable script. Two differences, both forced by what a migration is.
#
# It runs exactly once per database and can never be allowed to destroy
# anything, so the DELETE preamble goes and every INSERT becomes ON CONFLICT
# DO NOTHING — on a database that already holds these rows (stage today) it
# writes nothing at all, and on an empty one it writes everything.
#
# And it attributes the rows to an import actor rather than to a person,
# because a fresh production database has no people in it yet: pipelines
# .logged_by_id and agreements.prepared_by_id are NOT NULL, so something has
# to own these rows, and the truthful owner is the import itself.
MIGRATION = "--migration" in sys.argv
IMPORT_ACTOR_ID = "sys-data-import"


def society_slug(name: str) -> str:
    """slugifySociety() from src/lib/document-keys.ts, so the key matches."""
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-zA-Z0-9]+", "_", name.strip()))


def agreement_key(name: str, signed: str) -> str:
    sl = society_slug(name)
    return f"Documents/{sl}/{signed[:7]}/Agreements/{sl}_Agreement_{signed}.pdf"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def q(value) -> str:
    """A SQL string literal, or NULL."""
    if value is None or value == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def num(value):
    return "NULL" if value in (None, "") else str(value)


def rows(name: str):
    with open(f"{ROOT}/{name}.csv") as fh:
        return list(csv.DictReader(fh))


def snapshot_circuit(soc_slug: str, i: int, c: dict, metered: int) -> dict:
    """
    demo_reports.circuit_snapshot holds DemoReportCircuit, which is NOT the
    OfferCircuitTerm shape the offer and contract carry — it adds the
    extrapolation factor, the post-install average and the day-by-day
    readings. Writing the offer's shape here made the report page throw,
    because the view maps over readings that were not there.

    The readings are empty arrays and not omitted: no daily readings are
    imported by this backfill, and an absent array is the crash.
    """
    base = float(c["baseline_kwh_day"])
    after = float(c["after_kwh_day"])
    pct = float(c["savings_pct"])
    rep = int(c["represented_light_count"])
    factor = rep / metered
    return {
        "circuitId": f"bf-{soc_slug}-ckt-{i}",
        "lightType": c["light_type"],
        "location": c["circuit_location"] or None,
        "meteredLightCount": metered,
        "representedLightCount": rep,
        "extrapolationFactor": round(factor, 6),
        "preInstallBaseline": base,
        "postInstallAverage": after,
        "savedKwhPerDay": round(base - after, 4),
        "benchmarkSavingsPct": pct,
        "projectedSavedKwhPerDay": round(base * pct / 100 * factor, 4),
        "preInstallReadings": [],
        "postInstallReadings": [],
    }


def circuit_term(soc_slug: str, i: int, c: dict) -> dict:
    """One entry of offers.circuit_terms / contract_term_versions.circuit_benchmarks."""
    base = float(c["baseline_kwh_day"])
    pct = float(c["savings_pct"])
    return {
        "circuitId": f"bf-{soc_slug}-ckt-{i}",
        "lightType": c["light_type"],
        "location": c["circuit_location"] or None,
        "meteredLightCount": None,      # filled by the caller, which knows the devices
        "representedLightCount": int(c["represented_light_count"]),
        "benchmarkSavingsPct": pct,
        "preInstallBaseline": base,
        "projectedSavedKwhPerDay": round(base * pct / 100, 4),
    }


def preamble(sl: str) -> str:
    """What runs before a society's rows, which differs by what this output is.

    A script is re-run whenever a CSV changes, so it clears what its own
    previous run wrote — every id it touches is prefixed 'bf-', so it cannot
    reach a row someone made in the app. A migration runs once per database
    and must never destroy anything, so it deletes nothing and relies on
    ON CONFLICT DO NOTHING instead.
    """
    if MIGRATION:
        return ("-- Runs once per database, deletes nothing, and is a no-op\n"
                "-- wherever the rows are already present.\n"
                "-- (the DELETEs below are suppressed in migration mode)\n/*")
    return ("-- Re-runnable: clear anything a previous run of THIS generator left\n"
            "-- for the society, and nothing else. Every id it writes is prefixed\n"
            "-- 'bf-', so this cannot reach a row someone made in the app.")


def override_guard() -> str:
    """A migration may establish an override; it must never rewrite one.

    This UPDATE is not an INSERT, so ON CONFLICT DO NOTHING cannot protect
    it, and re-running it on a database that already holds the import
    reattributed a real person's billing decision to the import and restamped
    its date — silently rewriting who decided what a society is billed on,
    which is the thing INV-02 and INV-03 exist to prevent. In a script the
    UPDATE is unconditional, because the row was just deleted and rewritten.
    """
    return " AND benchmark_override_pct IS NULL" if MIGRATION else ""


def actor_where() -> str:
    """Which admin_users row owns the imported rows."""
    return f"a.id = {q(IMPORT_ACTOR_ID)}" if MIGRATION else f"{actor_where()}"


def main() -> None:
    only = None
    if "--only" in sys.argv:
        only = {s.strip() for s in sys.argv[sys.argv.index("--only") + 1].split(",")}

    societies = rows("societies")
    circuits = rows("circuits")
    devices = rows("circuit_devices")
    demos = rows("demos")
    demo_readings = rows("demo_readings")

    print("-- Generated by scripts/backfill-sql.py — do not edit by hand.")
    print(f"-- {date.today().isoformat()}\n")
    print("\\set ON_ERROR_STOP on\n")

    for s in societies:
        name = s["society_name"]
        if only and name not in only:
            continue
        sl = slug(name)
        mine = [c for c in circuits if c["society_name"] == name]
        has_contract = bool(s["term_start"])

        print(f"-- ═══ {name} " + "═" * max(0, 60 - len(name)))
        print("BEGIN;")
        print(f"""
{preamble(sl)}
DELETE FROM contract_term_versions WHERE contract_id = 'bf-{sl}-contract';
DELETE FROM contracts   WHERE id = 'bf-{sl}-contract';
DELETE FROM agreements  WHERE id = 'bf-{sl}-agreement';
DELETE FROM offers      WHERE id = 'bf-{sl}-offer';
DELETE FROM demo_reports WHERE id = 'bf-{sl}-demo-report';
DELETE FROM circuit_demo_readings WHERE demo_id IN (SELECT id FROM circuit_demos WHERE circuit_id LIKE 'bf-{sl}-ckt-%');
DELETE FROM circuit_demos   WHERE circuit_id LIKE 'bf-{sl}-ckt-%';
DELETE FROM meter_readings  WHERE circuit_id LIKE 'bf-{sl}-ckt-%';
DELETE FROM circuit_devices WHERE circuit_id LIKE 'bf-{sl}-ckt-%';
DELETE FROM circuits    WHERE id LIKE 'bf-{sl}-ckt-%';
DELETE FROM site_surveys WHERE id = 'bf-{sl}-survey';
DELETE FROM pipelines   WHERE id = 'bf-{sl}-pipe';
DELETE FROM engagements WHERE id = 'bf-{sl}-eng';{'*/' if MIGRATION else ''}""")
        print(f"""
-- The society must already exist, and exactly once. These were imported with
-- their flat counts and portal accounts, so a missing one is a mistake to
-- stop on rather than paper over by inserting a second row — and a DUPLICATE
-- one is worse, because every statement below matches by name and would
-- quietly write to both.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM societies WHERE name = {q(name)};
  IF n = 0 THEN RAISE EXCEPTION 'no society named %', {q(name)}; END IF;
  IF n > 1 THEN RAISE EXCEPTION '% societies named % — resolve the duplicate first', n, {q(name)}; END IF;
END $$;
""")
        loc = s["location"]
        if loc:
            print(f"""UPDATE societies
   SET status = 'active',
       location = {q(loc)},
       -- dedupe_key is derived from name|location and carries the unique
       -- index; it has to move with the address or it describes the old one.
       dedupe_key = btrim(regexp_replace(lower(name), '[^a-z0-9]+', ' ', 'g'))
                    || '|' || btrim(regexp_replace(lower({q(loc)}), '[^a-z0-9]+', ' ', 'g'))
 WHERE name = {q(name)};""")
        else:
            print(f"UPDATE societies SET status = 'active' WHERE name = {q(name)};   -- address left as stored")

        print(f"""
INSERT INTO engagements (id, society_id, service_line, status, created_at)
SELECT 'bf-{sl}-eng', s.id, 'lighting', 'active', now() FROM societies s WHERE s.name = {q(name)};

INSERT INTO pipelines (id, society_id, service_line, stage, contact_name, contact_phone,
                       meeting_date, sales_owner_id, logged_by_id, authoritative, notes,
                       created_at, updated_at)
SELECT 'bf-{sl}-pipe', s.id, 'lighting', {"'active_billing'" if has_contract else "'agreed'"},
       {q(s['contact_name'] or name)}, {q(s['contact_phone'])}, {q(s['agreement_signed_on'])}::date,
       a.id, a.id, true,
       {q('Backfilled from the signed agreement, the post-installation savings report and the first invoice. This deal predates the system: the date above is the agreement signature, not a meeting.')},
       now(), now()
FROM societies s, admin_users a WHERE s.name = {q(name)} AND {actor_where()};

INSERT INTO site_surveys (id, pipeline_id, created_at) VALUES ('bf-{sl}-survey', 'bf-{sl}-pipe', now());""")

        terms, snapshot = [], []
        for i, c in enumerate(mine, 1):
            cid = f"bf-{sl}-ckt-{i}"
            lines = [d for d in devices
                     if d["society_name"] == name and d["circuit_location"] == c["circuit_location"]]
            included = [d for d in lines if d["excluded"].lower() != "yes"]
            metered = sum(int(d["count"]) for d in included)
            primary = included[0]
            print(f"""
INSERT INTO circuits (id, society_id, site_survey_id, service_line, light_type,
                      metered_light_count, represented_light_count, wattage, working_hours,
                      state, location, meter_installed_at, light_replacement_date,
                      pre_install_baseline, benchmark_savings_pct, eligibility_checklist,
                      created_by_id, created_at)
SELECT '{cid}', s.id, 'bf-{sl}-survey', 'lighting', {q(c['light_type'])},
       {metered}, {c['represented_light_count']}, {primary['wattage_each']}, {primary['hours_per_day']},
       'benchmark_confirmed', {q(c['circuit_location'])},
       {q(c['meter_installed_on'])}::date, {q(c['lights_replaced_on'])}::date,
       {c['baseline_kwh_day']}, {c['savings_pct']},
       jsonb_build_object('backfilled', true, 'source', 'signed agreement + post-installation savings report',
                          'note', 'Commissioned before this system existed — CON-16 eligibility was never assessed.'),
       a.id, now()
FROM societies s, admin_users a WHERE s.name = {q(name)} AND {actor_where()};""")
            # FEAT-006's inventory line for this circuit's light type.
            #
            # The whole-society count is not missing for these societies — it
            # is the population the circuit already records itself as
            # representing, taken from the society's own first invoice. Not
            # writing it left the survey showing an empty inventory over two
            # real candidates, and the demo report refusing to generate for
            # want of a figure that was sitting on the circuit.
            #
            # `estimated`, because nobody walked the site; the note carries
            # where the number actually came from, and the screen shows it.
            print(f"""INSERT INTO lighting_inventory_areas (id, site_survey_id, area, light_type, count, method, note, created_at)
VALUES ('{cid}-inv', 'bf-{sl}-survey', {q(c['circuit_location'])}, {q(c['light_type'])},
        {c['represented_light_count']}, 'estimated',
        'Read from the society''s own documents — its first invoice and post-installation savings report. The site was never walked; this society was commissioned before this system existed.',
        now());""")
            for j, d in enumerate(lines, 1):
                excl = d["excluded"].lower() == "yes"
                print(f"""INSERT INTO circuit_devices (id, circuit_id, device_type_id, count, wattage, hours_per_day,
                             excluded_from_calculation, historical, historical_note, recorded_by_id, created_at)
SELECT '{cid}-dev-{j}', '{cid}', dt.id, {d['count']}, {d['wattage_each']}, {d['hours_per_day']},
       {str(excl).lower()}, true, 'Read from the post-installation savings report', a.id, now()
FROM device_types dt, admin_users a
WHERE dt.name = {q(d['device_name'])} AND dt.role = 'original' AND dt.deleted_at IS NULL
  AND {actor_where()};""")
            # FEAT-014 AC-7 — the demos this circuit's benchmark rests on.
            mine_demos = [d for d in demos
                          if d["society_name"] == name and d["circuit_location"] == c["circuit_location"]]
            live_pcts = []
            for d in mine_demos:
                pre, post = float(d["before_kwh_day"]), float(d["after_kwh_day"])
                pct = (pre - post) / pre * 100
                rejected = d["rejected"].lower() == "yes"
                if not rejected:
                    live_pcts.append(pct)
                print(f"""INSERT INTO circuit_demos (id, circuit_id, sequence, metered_light_count,
                           pre_install_baseline, post_install_average, savings_pct,
                           rejected, rejection_reason, note, created_at)
VALUES ('{cid}-demo-{d["demo"]}', '{cid}', {d["demo"]}, {d["metered_light_count"]},
        {pre}, {post}, {pct!r}, {str(rejected).lower()},
        {q(d["rejection_reason"])}, {q(d["note"])}, now());""")

                # The demo's own daily table, read straight out of the
                # report (or, for Ace City, out of the meter workbook that
                # reproduces it to four places). This is the evidence the
                # benchmark rests on — INV-02 asks that a billed figure
                # trace to the readings that produced it, and until now
                # these circuits had a percentage with nothing behind it.
                mine_readings = [r for r in demo_readings
                                 if r["society_name"] == name
                                 and r["circuit_location"] == c["circuit_location"]
                                 and r["demo"] == d["demo"]]
                for r in mine_readings:
                    print(f"""INSERT INTO circuit_demo_readings (id, demo_id, date, kwh, phase)
VALUES ('{cid}-demo-{d["demo"]}-{r["phase"]}-{r["date"]}', '{cid}-demo-{d["demo"]}',
        {q(r["date"])}::date, {r["kwh"]}, {q(r["phase"])});""")

            # AC-8 — where the agreed benchmark differs from what the demos
            # give, that difference is an override, recorded, not a silent
            # edit. Most of these do differ: reports round their own
            # per-demo percentages, and Aditya Mega City's agreement carries
            # a figure its raw readings never produced.
            agreed = float(c["savings_pct"])
            derived = sum(live_pcts) / len(live_pcts) if live_pcts else None
            # Only when they genuinely differ at the precision anyone reads.
            # Ace Aspire's demo gives 62.7803 against an agreed 62.78 — the
            # same number to any reader, and recording an override for it
            # would be noise that makes the real ones harder to see.
            if derived is not None and abs(derived - agreed) > 0.005:
                why = (f"Agreement states {agreed}%; the demos on record give "
                       f"{round(derived, 4)}%. The agreed figure is what this society is billed against.")
                print(f"""UPDATE circuits
   SET benchmark_override_pct = {agreed},
       benchmark_override_reason = {q(why)},
       benchmark_override_by_id = (SELECT a.id FROM admin_users a WHERE {actor_where()}),
       benchmark_override_at = now()
 WHERE id = '{cid}'{override_guard()};""")

            snapshot.append(snapshot_circuit(sl, i, c, metered))
            if c["billing"].lower() == "yes":
                t = circuit_term(sl, i, c)
                t["meteredLightCount"] = metered
                terms.append(t)

        terms_json = json.dumps(terms).replace("'", "''")
        snapshot_json = json.dumps(snapshot).replace("'", "''")
        first = mine[0]
        print(f"""
-- The demo report. Not needed for billing, but without it the deal map sits
-- at "Demo savings report · In progress" while every later step reads done.
INSERT INTO demo_reports (id, pipeline_id, version, status,
                          pre_install_baseline_total, post_install_average_total, measured_savings_pct,
                          society_light_count, metered_light_count, extrapolation_factor,
                          projected_savings_kwh_per_day, circuit_snapshot, generated_at, shared_at, shared_by_id)
SELECT 'bf-{sl}-demo-report', 'bf-{sl}-pipe', 1, 'shared',
       c.pre_install_baseline, c.pre_install_baseline * (1 - c.benchmark_savings_pct / 100),
       c.benchmark_savings_pct, c.represented_light_count, c.metered_light_count,
       c.represented_light_count::double precision / c.metered_light_count,
       (c.pre_install_baseline * c.benchmark_savings_pct / 100)
         * (c.represented_light_count::double precision / c.metered_light_count),
       '{snapshot_json}'::jsonb, now(), {q(s['agreement_signed_on'])}::date, a.id
FROM circuits c, admin_users a
-- shared_by_id is an ADMIN, not a profile: FirsThing shares the report WITH
-- the society, so the sharer is internal. The mirror of offers, where
-- responded_by_id IS a profile because accepting is the society's act.
WHERE c.id = 'bf-{sl}-ckt-1' AND {actor_where()};

INSERT INTO offers (id, pipeline_id, version, status, benchmark_source, circuit_terms,
                    tolerance_pct, revenue_share_pct, unit_electricity_rate, term_months,
                    projected_monthly_fee, issued_at, issued_by_id, responded_at, responded_by_id, created_at)
SELECT 'bf-{sl}-offer', 'bf-{sl}-pipe', 1, 'accepted', 'negotiated_fixed', '{terms_json}'::jsonb,
       {s['tolerance_pct']}, {s['society_share_pct']}, {s['unit_rate_inr']}, {s['term_months']},
       {num(s['monthly_fee_inr'])}, {q(s['agreement_signed_on'])}::date, a.id,
       {q(s['agreement_signed_on'])}::date, p.id, now()
FROM admin_users a
LEFT JOIN societies soc ON soc.name = {q(name)}
LEFT JOIN profiles p ON p.society_id = soc.id AND p.portal_authority = 'office_bearer' AND p.is_active
WHERE {actor_where()};

INSERT INTO agreements (id, pipeline_id, offer_id, prepared_at, prepared_by_id,
                        printed_at, notarized_at, signed_at,
                        executed_s3_key, executed_file_name, uploaded_at, uploaded_by_id)
SELECT 'bf-{sl}-agreement', 'bf-{sl}-pipe', 'bf-{sl}-offer', {q(s['agreement_signed_on'])}::date, a.id,
       -- Printed and notarised are the same day, and it is the e-stamp
       -- certificate date on page 1 (the user, 2026-08-27). It can fall after
       -- the front-page date, which is a backdated effective date rather than
       -- a mistake.
       {q(s['printed_notarized_on'])}::date, {q(s['printed_notarized_on'])}::date,
       {q(s['agreement_signed_on'])}::date,
       {q(agreement_key(name, s['agreement_signed_on']))},
       {q(society_slug(name) + '_Agreement_' + s['agreement_signed_on'] + '.pdf')},
       -- The scan reaches us the day after signing.
       ({q(s['agreement_signed_on'])}::date + 1), a.id
FROM admin_users a WHERE {actor_where()};""")
        void(first)

        if has_contract:
            print(f"""
INSERT INTO contracts (id, pipeline_id, society_id, service_line, agreement_id, status,
                       term_start, term_end, activated_at, activated_by_id, created_at)
SELECT 'bf-{sl}-contract', 'bf-{sl}-pipe', s.id, 'lighting', 'bf-{sl}-agreement', 'active',
       {q(s['term_start'])}::date, ({q(s['term_start'])}::date + '{s['term_months']} months'::interval),
       {q(s['term_start'])}::date, a.id, now()
FROM societies s, admin_users a WHERE s.name = {q(name)} AND {actor_where()};

INSERT INTO contract_term_versions (id, contract_id, version, effective_from, benchmark_source,
                                    tolerance_pct, revenue_share_pct, unit_electricity_rate,
                                    circuit_benchmarks, recorded_by_id, recorded_at)
SELECT 'bf-{sl}-terms', 'bf-{sl}-contract', 1, {q(s['term_start'])}::date, 'negotiated_fixed',
       {s['tolerance_pct']}, {s['society_share_pct']}, {s['unit_rate_inr']},
       '{terms_json}'::jsonb, a.id, now()
FROM admin_users a WHERE {actor_where()};""")
        else:
            print(f"\n-- No contract: term_start is unknown, so there is nothing to run the term from.")
            print(f"-- The agreement and its offer stand; the deal waits at 'agreed'.")
        print("COMMIT;\n")


def void(_):
    return None


def as_migration(sql: str) -> str:
    r"""Turn the script output into something Prisma can apply.

    Three differences, none cosmetic:

    - `\set` is a psql meta-command. Prisma applies migrations through its own
      engine, which never sees psql, so the line is a syntax error there.
    - Prisma already runs each migration inside a transaction. An explicit
      COMMIT would end Prisma's transaction half way through the file, which
      is far worse than the stray BEGIN it pairs with.
    - Every INSERT becomes a no-op where the row is already there, so applying
      this to a database that already holds the import changes nothing.

    The INSERTs are matched to the first `;` that ENDS a line, not to the
    first `;` anywhere: a circuit snapshot is JSON and carries semicolons of
    its own, and splitting on those cut statements in half.
    """
    kept = [
        ln for ln in sql.splitlines()
        if ln.strip() not in ("BEGIN;", "COMMIT;") and not ln.strip().startswith("\\set")
    ]
    body = "\n".join(kept)
    return re.sub(
        r"(?ms)^(INSERT\b.*?);[ \t]*$",
        lambda m: m.group(1) + " ON CONFLICT DO NOTHING;",
        body,
    )


if __name__ == "__main__":
    if MIGRATION:
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            main()
        print(as_migration(buf.getvalue()))
    else:
        main()
