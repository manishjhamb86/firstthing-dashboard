#!/usr/bin/env bash
# The stage deploy itself — runs ON the server, detached from any SSH session
# (2026-09-26, user-asked). deploy-stage.sh on a laptop only triggers it and
# follows the log: three deploys in a row lost their SSH connection during
# `next build`, which killed the build and left .next without a BUILD_ID —
# stage down until someone rebuilt by hand. Started under setsid/nohup, this
# keeps going when the connection drops, and the laptop just reconnects to
# the log.
#
#   bash scripts/stage-deploy-remote.sh <branch> <log-file>
#
# The last line of the log is always "DEPLOY_DONE <commit>" or
# "DEPLOY_FAILED <reason>" — the laptop side stops following on either.
#
# The order matters and each step is here for a reason this project has
# been bitten by:
#   - backup BEFORE migrate, and check the file has a real size (a pg_dump
#     that "succeeds" into a 0-byte file is worse than one that fails)
#   - prisma generate before build, or the build compiles against a stale
#     client
#   - restart the job worker too: it shares the generated client, and a
#     long-lived process holding an old one is a bug this repo has hit
set -uo pipefail

BRANCH="$1"
LOG="$2"
APP_DIR="/zenovaa/code/firsthing-dashboard"
exec >>"$LOG" 2>&1

fail() { echo "DEPLOY_FAILED $*"; exit 1; }
trap 'fail "step exited with status $? (line $LINENO)"' ERR
set -e

# One deploy at a time: two builds writing one .next corrupt each other.
exec 9>/tmp/firsthing-deploy.lock
flock -n 9 || fail "another deploy is still running (see /tmp/firsthing-deploy-latest.log)"

cd "$APP_DIR"

URL=$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed 's/?schema=public//')
STAMP=$(date +%Y%m%d_%H%M%S)
BACKUP="/tmp/firsthing_blueprint_${STAMP}.sql"
pg_dump "$URL" > "$BACKUP"
SIZE=$(stat -c%s "$BACKUP")
[ "$SIZE" -ge 10000 ] || fail "backup is only $SIZE bytes — refusing to migrate against it"
echo "  backup $BACKUP ($SIZE bytes)"

COMMIT=$(git rev-parse --short HEAD)
echo "  at $COMMIT ($BRANCH) — $(git log -1 --pretty=%s)"

pnpm install --frozen-lockfile
pnpm prisma migrate deploy
pnpm prisma generate
# The box has 1.9 GB of RAM total; an unbounded build heap intermittently
# OOM-kills the build worker (twice on 2026-08-31). 1200 MB was enough until the
# codebase outgrew it on 2026-09-25 (type check ran out); 1600 fits with swap.
NODE_OPTIONS=--max-old-space-size=1600 pnpm build
[ -f .next/BUILD_ID ] || fail "the build finished without a BUILD_ID"

# Stamp the release onto both processes. instrumentation-node.ts and
# job-worker.ts read GIT_COMMIT and put it on every startup line, so a
# restart is attributable to a release instead of guessed at. --update-env
# is what carries it in, and pm2 keeps it across a crash-restart afterwards.
export GIT_COMMIT="$COMMIT"
pm2 restart firsthing-dashboard --update-env
pm2 restart firsthing-job-worker --update-env
sleep 6
pm2 describe firsthing-dashboard | grep -E 'status|unstable restarts' || true
CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3005/login || true)
echo "  login answers $CODE"
echo "  --- startup lines ---"
tail -n 200 ~/.pm2/logs/firsthing-dashboard-out.log | grep -o '"event":"web.server_[a-z_]*"[^}]*' | tail -2 || true
tail -n 200 ~/.pm2/logs/firsthing-job-worker-out.log | grep -o '"event":"job.worker_[a-z_]*"[^}]*' | tail -2 || true
[ "$CODE" = "200" ] || fail "the app did not answer 200 after the restart"
trap - ERR
echo "DEPLOY_DONE $COMMIT"
