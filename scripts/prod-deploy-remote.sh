#!/usr/bin/env bash
# The production deploy itself — runs ON the firsthing box, detached from
# any SSH session, mirroring scripts/stage-deploy-remote.sh's own reasoning
# almost exactly. deploy-prod.sh on a laptop only triggers it and follows
# the log; a dropped SSH connection cannot kill it.
#
#   bash scripts/prod-deploy-remote.sh <branch> <log-file>
#
# The last line of the log is always "DEPLOY_DONE <commit>" or
# "DEPLOY_FAILED <reason>".
#
# The one rule this script exists to enforce (2026-10-20, user-asked, after a
# real outage): `rm -rf .next` immediately followed by `pnpm build` makes the
# ALREADY-RUNNING process fragile — the moment it needs to lazy-load a chunk
# it hasn't touched yet, the file is gone underneath it, and it crashes with
# a ChunkLoadError. That gap is only ever safe when it is seconds long,
# because `pm2 restart` runs immediately after the build completes, inside
# this ONE script, with nothing in between that could pause, get
# interrupted, or wait on a human. Never run `rm -rf .next`/`pnpm build`
# against this box as a separate step from the restart that follows it —
# that separation is exactly what caused the outage this script was written
# to prevent.
#
# No backup step here, unlike stage's own script — this box has no pg_dump
# or psql installed (a standing, already-documented gap, not something this
# script works around unilaterally). A deploy that also carries a schema
# migration should get a backup taken by hand first, from a machine that can
# reach the production database, before running this.
set -uo pipefail

BRANCH="$1"
LOG="$2"
APP_DIR="/firsthing/code/firsthing-dashboard"
exec >>"$LOG" 2>&1

fail() { echo "DEPLOY_FAILED $*"; exit 1; }
trap 'fail "step exited with status $? (line $LINENO)"' ERR
set -e

export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm use v22.23.2 >/dev/null

# One deploy at a time: two builds writing one .next corrupt each other.
exec 9>/tmp/firsthing-prod-deploy.lock
flock -n 9 || fail "another deploy is still running (see /tmp/firsthing-prod-deploy-latest.log)"

cd "$APP_DIR"

git fetch -q origin "$BRANCH"
git checkout -q "$BRANCH"
git reset -q --hard "origin/$BRANCH"
COMMIT=$(git rev-parse --short HEAD)
echo "  at $COMMIT ($BRANCH) — $(git log -1 --pretty=%s)"

pnpm install --frozen-lockfile
pnpm prisma migrate deploy
pnpm prisma generate

# --- From here on, nothing may pause. Build and restart are one unit. ---
rm -rf .next
NODE_OPTIONS=--max-old-space-size=1600 pnpm build
[ -f .next/BUILD_ID ] || fail "the build finished without a BUILD_ID"

export GIT_COMMIT="$COMMIT"
pm2 restart firsthing-dashboard --update-env
pm2 restart firsthing-job-worker --update-env
sleep 3
pm2 describe firsthing-dashboard | grep -E 'status|unstable restarts' || true
pm2 describe firsthing-job-worker | grep -E 'status|unstable restarts' || true

CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login || true)
echo "  login answers $CODE"
echo "  --- startup lines ---"
tail -n 200 ~/.pm2/logs/firsthing-dashboard-out.log | grep -o '"event":"web.server_[a-z_]*"[^}]*' | tail -2 || true
tail -n 200 ~/.pm2/logs/firsthing-job-worker-out.log | grep -o '"event":"job.worker_[a-z_]*"[^}]*' | tail -2 || true
[ "$CODE" = "200" ] || fail "the app did not answer 200 after the restart"
trap - ERR
echo "DEPLOY_DONE $COMMIT"
