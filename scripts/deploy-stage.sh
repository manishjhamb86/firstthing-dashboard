#!/usr/bin/env bash
# Stage deploy, git-based (user's call 2026-08-17 — replaces the rsync
# convention now that origin is confirmed the user's own repo).
#
#   ./scripts/deploy-stage.sh [branch]
#
# Push first, then the server pulls that exact commit — so what runs on
# stage is always a commit that exists in history, not a working tree only
# one machine ever had.
#
# The order matters and each step is here for a reason this project has
# been bitten by:
#   - backup BEFORE migrate, and check the file has a real size (a pg_dump
#     that "succeeds" into a 0-byte file is worse than one that fails)
#   - prisma generate before build, or the build compiles against a stale
#     client
#   - restart the job worker too: it shares the generated client, and a
#     long-lived process holding an old one is a bug this repo has hit
set -euo pipefail

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
SERVER="zenovaa"
APP_DIR="/zenovaa/code/firsthing-dashboard"

echo "▸ pushing $BRANCH"
git push origin "$BRANCH"

echo "▸ deploying $BRANCH on $SERVER"
ssh "$SERVER" bash -se <<EOF
set -euo pipefail
cd "$APP_DIR"

URL=\$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed 's/?schema=public//')
STAMP=\$(date +%Y%m%d_%H%M%S)
BACKUP="/tmp/firsthing_blueprint_\${STAMP}.sql"
pg_dump "\$URL" > "\$BACKUP"
SIZE=\$(stat -c%s "\$BACKUP")
if [ "\$SIZE" -lt 10000 ]; then
  echo "✗ backup is only \$SIZE bytes — refusing to migrate against it"
  exit 1
fi
echo "  backup \$BACKUP (\$SIZE bytes)"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
COMMIT=\$(git rev-parse --short HEAD)
echo "  now at \$COMMIT — \$(git log -1 --pretty=%s)"

pnpm install --frozen-lockfile
pnpm prisma migrate deploy
pnpm prisma generate
pnpm build

# Stamp the release onto both processes. instrumentation-node.ts and
# job-worker.ts read GIT_COMMIT and put it on every startup line, so a
# restart is attributable to a release instead of guessed at — which is the
# whole point of having asked why they restart. --update-env is what carries
# it in, and pm2 keeps it across a crash-restart afterwards.
export GIT_COMMIT="\$COMMIT"
pm2 restart firsthing-dashboard --update-env
pm2 restart firsthing-job-worker --update-env
sleep 4
pm2 describe firsthing-dashboard | grep -E 'status|unstable restarts'
# The reason each process is running what it is running — one line each,
# from the app's and the worker's own logs rather than from pm2's counters.
echo "  --- startup lines ---"
tail -n 200 ~/.pm2/logs/firsthing-dashboard-out.log | grep -o '"event":"web.server_[a-z_]*"[^}]*' | tail -2 || true
tail -n 200 ~/.pm2/logs/firsthing-job-worker-out.log | grep -o '"event":"job.worker_[a-z_]*"[^}]*' | tail -2 || true
EOF

echo "▸ deployed — https://stage.firsthing.earth"
