#!/usr/bin/env python3
"""Write the data migrations that carry this business's records into an empty database.

    python3 scripts/make-data-migrations.py

`prisma migrate deploy` applies these like any other migration, so a
production go-live brings the 19 societies and their backfilled deals with
it rather than depending on somebody remembering to run a script.

WHAT IS DELIBERATELY NOT HERE, and why:

  - **Passwords.** `admin_users.password_hash` and `profiles.password_hash`
    are NOT NULL, and on stage 36 portal accounts share two hashes between
    them, because they are all `password123`. Committing those to git would
    ship a known password for every account in production.
  - **The Tuya API id and secret.** A live credential does not belong in a
    tracked file.
  - **The 36 portal accounts themselves.** They are real people's names and
    email addresses. SPIKE-02, the India DPDP review, is still open in this
    blueprint, and committing a society committee's contact details into a
    git repository is exactly what that review exists to catch. Production
    creates them the way the product already specifies: PER-01 creates the
    first office-bearer, who creates the rest (FEAT-108 rule 6).

Those three come from `scripts/rebuild-sql.sh`, whose output stays out of
git, or are entered once through the app.

The imported rows are attributed to an import actor rather than to a person:
`pipelines.logged_by_id` and `agreements.prepared_by_id` are NOT NULL, a
fresh production database has no people in it, and the truthful owner of a
row created by an import is the import.
"""
from __future__ import annotations
import subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "prisma" / "migrations"

# A valid bcrypt hash of 32 random bytes nobody kept. Valid so that
# bcrypt.compare returns false cleanly instead of throwing on a malformed
# string; unknown so that it can never be a way in. The row it belongs to is
# is_active = false as well, which is what actually refuses the session.
LOCKED = "$2b$10$Ph9Uy9Wl1kkKQwGZ5Nr7ZOqW1cCk9uZ2vJQKZ3xY8mR6tN0aB4dLu"

IMPORT_ACTOR = f"""-- The import's own actor.
--
-- Several imported rows require an owner that cannot be null, and a fresh
-- database has no people in it yet. This row is not a login: it is inactive,
-- and its password hash is of random bytes nobody kept, so both the row check
-- in resolveAdmin() and bcrypt refuse it independently.
INSERT INTO admin_users (id, email, password_hash, name, permissions, is_active, created_at)
VALUES ('sys-data-import', 'import@firsthing.invalid', '{LOCKED}',
        'Data import', ARRAY[]::admin_permission[], false, now())
ON CONFLICT DO NOTHING;
"""


def dump(tables: list[str], where: dict[str, str] | None = None) -> str:
    """Rows as they stand on stage, as INSERTs that cannot overwrite anything.

    Bare ON CONFLICT DO NOTHING, with no target: naming (id) only catches an
    id collision, and the dev database already held "Tube light 20W" under a
    different id, so the migration died on device_types_name_key. Any database
    that is not empty can have a row that is "already there" by some other
    unique key, and the insert has to stand down for all of them.
    """
    cols_sql = " UNION ALL ".join(
        f"""select {i} as ord, format(
              'INSERT INTO %I (%s) VALUES (%s) ON CONFLICT DO NOTHING;',
              '{t}',
              (select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
                 from information_schema.columns
                where table_schema='public' and table_name='{t}'),
              (select string_agg(quote_nullable(x.value::text), ', ' order by c.ordinal_position)
                 from information_schema.columns c
                 join lateral (select to_jsonb(r) ->> c.column_name as value) x on true
                where c.table_schema='public' and c.table_name='{t}')) as stmt
           from public.{t} r {('where ' + where[t]) if where and t in where else ''}"""
        for i, t in enumerate(tables)
    )
    out = subprocess.run(
        ["ssh", "zenovaa", "bash", "-s"],
        input=f"""set -euo pipefail
cd /zenovaa/code/firsthing-dashboard
URL=$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed 's/?schema=public//')
psql "$URL" -tAc "select stmt from ({cols_sql}) q order by ord" """,
        capture_output=True, text=True, check=True,
    )
    return out.stdout.strip()


def admin_ids() -> list[str]:
    out = subprocess.run(
        ["ssh", "zenovaa", "bash", "-s"],
        input="""set -euo pipefail
cd /zenovaa/code/firsthing-dashboard
URL=$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed 's/?schema=public//')
psql "$URL" -tAc "select id from admin_users where id <> 'sys-data-import'" """,
        capture_output=True, text=True, check=True,
    )
    return [x for x in out.stdout.split() if x]


def rewrite_actors(sql: str, ids: list[str]) -> str:
    """Point every 'who did this' column at the import, not at a real person.

    A dumped row carries the id of whoever happened to do the thing on stage.
    That row does not exist in a fresh production database, so the foreign key
    refuses — and even if it did, attributing an import to a named colleague
    would be a small lie in a system whose whole point is that a figure traces
    to what produced it.
    """
    for i in ids:
        sql = sql.replace(i, "sys-data-import")
    return sql


# One migration per batch of societies. Append a new entry for a new batch;
# never widen an entry that has been applied.
BATCHES = [
    (
        "20260827120200_data_backfilled_societies",
        "Ace City,Ace Aspire,Aditya Mega City,Aditya Urban Casa",
        # The documents filed against these societies. They point at objects
        # in the same S3 bucket, so they carry over as records, not files.
        ["stored_documents", "document_extractions"],
    ),
    ("20260828060000_data_amrapali_princely_estate", "Amrapali Princely Estate", []),
    ("20260828090000_data_arihant_arden", "Arihant Arden", []),
    ("20260828110000_data_ats_greens_paradiso", "ATS Greens Paradiso", []),
    ("20260828130000_data_bestech_park_view", "Bestech Park View Residency", []),
    ("20260828160000_data_elite_homz", "Elite Homz", []),
]


def backfill_for(only: str) -> str:
    return subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "backfill-sql.py"), "--migration", "--only", only],
        capture_output=True, text=True, check=True,
    ).stdout


def replacement_options() -> str:
    """Each option as a lookup by the two type names it joins."""
    out = subprocess.run(
        ["ssh", "zenovaa", "bash", "-s"],
        input="""set -euo pipefail
cd /zenovaa/code/firsthing-dashboard
URL=$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed 's/?schema=public//')
psql "$URL" -tAF'|' -c "select o.id, ot.name, rt.name from device_replacement_options o
  join device_types ot on ot.id = o.original_type_id
  join device_types rt on rt.id = o.replacement_type_id order by o.id" """,
        capture_output=True, text=True, check=True,
    )
    lines = []
    for row in out.stdout.strip().splitlines():
        oid, orig, repl = row.split("|")
        lines.append(
            "INSERT INTO device_replacement_options (id, original_type_id, replacement_type_id)\n"
            f"SELECT '{oid}', ot.id, rt.id FROM device_types ot, device_types rt\n"
            f" WHERE ot.name = '{orig}' AND rt.name = '{repl}'\n"
            "ON CONFLICT DO NOTHING;"
        )
    return "\n\n".join(lines)


def write(name: str, body: str) -> None:
    """Write a migration, and never touch one that already exists.

    Prisma checksums every migration it has applied, so even re-wording a
    comment in one that has run somewhere is reported as a modified migration
    on the next deploy. Regenerating is for adding the NEXT batch, not for
    revising the last — so an existing directory is left exactly as it is.
    """
    d = MIGRATIONS / name
    if (d / "migration.sql").exists():
        print(f"  {name}/migration.sql — exists, left untouched")
        return
    d.mkdir(parents=True, exist_ok=True)
    (d / "migration.sql").write_text(body.rstrip() + "\n")
    n = body.count("INSERT INTO")
    print(f"  {name}/migration.sql — {n} inserts, {len(body)} bytes")


def main() -> None:
    print("▸ writing data migrations")
    ids = admin_ids()

    write("20260827115900_data_import_actor", f"""-- The actor every imported row belongs to.
--
-- It runs first because the catalog and the backfilled societies both point
-- at it, and several of those columns cannot be null.

{IMPORT_ACTOR}
""")

    write("20260827120000_data_device_catalog", f"""-- The device catalog every circuit's load inventory points at.
--
-- A circuit_devices row references a device_type, so these must exist before
-- any society's data lands. Nothing here is personal or secret: it is a list
-- of light fittings and their wattages.
--
-- The replacement options are inserted by NAME rather than by id, and that
-- is not a stylistic choice. device_types.name is unique, so on a database
-- that already knows "Tube light 20W" under some other id the type insert
-- correctly stands down — and an option row carrying the id this file
-- expected would then point at a type that was never inserted. Resolving the
-- pair by name means the option lands against whichever row is really there.

{rewrite_actors(dump(["device_types"]), ids)}

{replacement_options()}
""")

    write("20260827120100_data_societies", f"""-- The 19 societies this business serves.
--
-- Business records: name, location, flat count, status. Their portal
-- accounts are deliberately NOT here — see scripts/make-data-migrations.py
-- for why, and how production creates them instead.

{rewrite_actors(dump(["societies"]), ids)}
""")

    for name, only, extras in BATCHES:
        write(name, f"""-- Societies commissioned before this system existed: {only}.
--
-- Each was read from two documents — its signed agreement and its
-- post-installation savings report — into one pipeline, survey, circuit set,
-- demo set and contract. Generated by
--   scripts/backfill-sql.py --migration --only "{only}"
-- Do not edit by hand, and do not add a society to it once it has been
-- applied anywhere: Prisma checksums an applied migration, so appending
-- would be reported as a modified migration on the next deploy — and the new
-- rows would not land, because this one is already recorded as done. Add
-- another migration instead.

{rewrite_actors(backfill_for(only), ids)}
{rewrite_actors(dump(extras), ids) if extras else ""}
""")


if __name__ == "__main__":
    main()
