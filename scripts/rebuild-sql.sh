#!/usr/bin/env bash
# Dump the things a migration cannot carry.
#
#   ./scripts/rebuild-sql.sh [database]        (default: firsthing_stage)
#
# The business records — the 19 societies, the device catalog, and the deals
# backfilled from each society's agreement and demo report — are Prisma data
# migrations now (prisma/migrations/2026082712*), so `prisma migrate deploy`
# brings them to any database, production included, with nobody having to
# remember a script.
#
# What CANNOT go in a migration, and so comes from here:
#
#   - **Passwords.** admin_users.password_hash and profiles.password_hash are
#     NOT NULL, and on stage 36 portal accounts share two hashes between them
#     because they are all `password123`. Committing those would ship a known
#     password for every account.
#   - **The Tuya API id and secret.** A live credential does not belong in a
#     tracked file.
#   - **The 36 portal accounts.** Real people's names and email addresses.
#     SPIKE-02, the India DPDP review, is still open in this blueprint, and a
#     society committee's contact details in a git repository is what that
#     review exists to catch.
#   - **The mirrored water tanks and their readings.** Environment-specific
#     telemetry. A production database re-syncs them from the Tuya account;
#     this is only so a rebuilt STAGE keeps its history.
#
# So: to rebuild an environment, `prisma migrate deploy` and then this one
# file. To stand up production, `prisma migrate deploy` and then create the
# first admin and enter the Tuya credentials through the app.
#
# restore/ is gitignored. This script is the artifact worth keeping.
set -euo pipefail

DB="${1:-firsthing_stage}"
SERVER="zenovaa"
OUT="$(cd "$(dirname "$0")/.." && pwd)/restore"
mkdir -p "$OUT"

# pg_dump runs on the server: its 16.15 matches the server's own, and no row
# has to cross the tunnel.
# A table that points at itself cannot be loaded in row order: stage's
# admin@firsthing.earth is created_by yogesh@firsthing.earth, and pg_dump
# emits it first, so the plain dump fails on its own foreign key. Deferring
# those constraints for the length of the load is exact — no row is
# reordered and nothing is left disabled, since the wrapper puts each
# constraint back as Prisma's migration declared it.
self_ref_wrapper() {
  local file="$1"; shift
  local cons
  cons=$(psql_stage "select quote_ident(n.nspname)||'.'||quote_ident(cl.relname)||' '||c.conname
                       from pg_constraint c
                       join pg_class cl on cl.oid = c.conrelid
                       join pg_namespace n on n.oid = cl.relnamespace
                      where c.contype='f' and c.conrelid = c.confrelid
                        and cl.relname in ($(printf "'%s'," "$@" | sed 's/,$//'))")
  [ -z "$cons" ] && return 0
  local pre="" post=""
  while read -r tbl con; do
    [ -z "$tbl" ] && continue
    pre="$pre
ALTER TABLE $tbl ALTER CONSTRAINT $con DEFERRABLE INITIALLY DEFERRED;"
    post="$post
ALTER TABLE $tbl ALTER CONSTRAINT $con NOT DEFERRABLE;"
  done <<< "$cons"
  printf 'BEGIN;%s\nSET CONSTRAINTS ALL DEFERRED;\n\n' "$pre" | cat - "$OUT/$file" > "$OUT/$file.tmp"
  printf '\nCOMMIT;%s\n' "$post" >> "$OUT/$file.tmp"
  mv "$OUT/$file.tmp" "$OUT/$file"
}

psql_stage() {
  ssh "$SERVER" "URL=\$(grep '^DATABASE_URL' /zenovaa/code/firsthing-dashboard/.env | cut -d= -f2- | tr -d '\"' | sed 's/?schema=public//' | sed 's#/[^/]*\$#/$DB#'); \
    psql \"\$URL\" -tAc \"$1\""
}

dump() {
  local file="$1"; shift
  local args=""
  for t in "$@"; do args="$args --table=$t"; done
  ssh "$SERVER" "URL=\$(grep '^DATABASE_URL' /zenovaa/code/firsthing-dashboard/.env | cut -d= -f2- | tr -d '\"' | sed 's/?schema=public//' | sed 's#/[^/]*\$#/$DB#'); \
    pg_dump \"\$URL\" --data-only --column-inserts --no-owner --no-privileges $args" > "$OUT/$file"
  # These now run against a database `prisma migrate deploy` has already
  # populated, so every insert has to be a no-op where the row is present —
  # pg_dump does not do that on its own, and a plain INSERT collides with the
  # societies the data migration just wrote.
  sed -i.bak -E 's/^(INSERT INTO .*)\);$/\1) ON CONFLICT DO NOTHING;/' "$OUT/$file" && rm -f "$OUT/$file.bak"
  local n; n=$(grep -c '^INSERT' "$OUT/$file" || true)
  local bytes; bytes=$(wc -c < "$OUT/$file")
  # A dump that "succeeds" into an empty file is worse than one that fails.
  if [ "$n" -eq 0 ]; then echo "✗ $file has no INSERTs ($bytes bytes)" >&2; exit 1; fi
  self_ref_wrapper "$file" "$@"
  echo "  $file — $n inserts, $(wc -c < "$OUT/$file") bytes"
}

echo "▸ reading $DB on $SERVER"
dump credentials.sql \
  admin_users profiles tank_api_config water_tanks tank_level_readings

# societies is dumped too, but only because profiles point at it: a rebuilt
# environment needs the society rows present before its portal accounts land.
# On a database built by `prisma migrate deploy` they are already there, so
# every one of these inserts is a no-op.
dump societies.sql societies

echo "▸ written to restore/"
