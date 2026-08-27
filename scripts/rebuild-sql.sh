#!/usr/bin/env bash
# Produce the three scripts that rebuild a database from empty.
#
#   ./scripts/rebuild-sql.sh [database]        (default: firsthing_stage)
#
# Run them, in order, against a database that `prisma migrate deploy` has
# just built:
#
#   00-platform.sql   the things that have nothing to do with any society —
#                     back-office logins, the device catalog, the Tuya API
#                     credentials, the mirrored water tanks and their history
#   01-societies.sql  the 19 society records and their portal accounts
#   02-society-data.sql  the deal-to-contract data for the societies
#                     backfilled from their agreement and demo report, plus
#                     the documents filed against them
#
# The order is the foreign-key order and is not a preference: profiles point
# at societies, everything points at an admin_users row, and the backfill
# joins the device catalog by name.
#
# 00 and 01 are DUMPED from the live database rather than hand-written,
# because they carry things no document can regenerate — bcrypt password
# hashes, an API secret, the exact ids other rows point at. 02 is GENERATED
# from docs/backfill/*.csv, because it can be: it is the two documents per
# society read into a transaction, and regenerating it is the point.
#
# The output holds a live API secret and password hashes, so restore/ is
# gitignored. This script is the artifact worth keeping, not its output.
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
  local n; n=$(grep -c '^INSERT' "$OUT/$file" || true)
  local bytes; bytes=$(wc -c < "$OUT/$file")
  # A dump that "succeeds" into an empty file is worse than one that fails.
  if [ "$n" -eq 0 ]; then echo "✗ $file has no INSERTs ($bytes bytes)" >&2; exit 1; fi
  self_ref_wrapper "$file" "$@"
  echo "  $file — $n inserts, $(wc -c < "$OUT/$file") bytes"
}

echo "▸ reading $DB on $SERVER"
dump 00-platform.sql \
  admin_users device_types device_replacement_options tank_api_config \
  water_tanks tank_level_readings
dump 01-societies.sql societies profiles

# The backfill, regenerated from the documents' own CSVs, then the documents
# filed against those societies (which are S3 objects, not facts a CSV holds).
{
  python3 "$(dirname "$0")/backfill-sql.py"
  echo
  echo "-- Documents filed against these societies."
} > "$OUT/02-society-data.sql"
dump 02-documents.sql stored_documents document_extractions
cat "$OUT/02-documents.sql" >> "$OUT/02-society-data.sql"
rm "$OUT/02-documents.sql"
echo "  02-society-data.sql — $(grep -c '^INSERT' "$OUT/02-society-data.sql") inserts, $(wc -c < "$OUT/02-society-data.sql") bytes"

echo "▸ written to restore/"
