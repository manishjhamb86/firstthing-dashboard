#!/usr/bin/env bash
# Stage deploy, git-based (user's call 2026-08-17).
#
#   ./scripts/deploy-stage.sh [branch]    push, deploy, follow the log
#   ./scripts/deploy-stage.sh --follow    reattach to the latest deploy's log
#
# The deploy RUNS ON THE SERVER (scripts/stage-deploy-remote.sh), started
# detached, so a dropped SSH connection no longer kills the build halfway
# (2026-09-26, user-asked — three deploys in a row had died in `next build`
# and left stage without a build). This side only pushes, triggers, and then
# follows the server's log, reconnecting whenever the connection drops, until
# the log says DEPLOY_DONE or DEPLOY_FAILED.
#
# Push first, then the server checks out that exact commit — so what runs on
# stage is always a commit that exists in history, not a working tree only
# one machine ever had.
set -euo pipefail

SERVER="zenovaa"
APP_DIR="/zenovaa/code/firsthing-dashboard"
LATEST="/tmp/firsthing-deploy-latest.log"
SSH=(ssh -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 "$SERVER")

follow() {
  local log="$1" seen=0 lines
  echo "▸ following $log on $SERVER (the deploy keeps running if this drops)"
  while true; do
    if lines=$("${SSH[@]}" "tail -n +$((seen + 1)) '$log' 2>/dev/null"); then
      if [ -n "$lines" ]; then
        printf '%s\n' "$lines"
        seen=$((seen + $(printf '%s\n' "$lines" | wc -l)))
        if grep -q '^DEPLOY_DONE' <<<"$lines"; then
          echo "▸ deployed — https://stage.firsthing.earth"
          return 0
        fi
        if grep -q '^DEPLOY_FAILED' <<<"$lines"; then
          echo "✗ deploy failed on the server — full log: $log"
          return 1
        fi
      fi
    else
      echo "  (connection dropped — reconnecting; the deploy continues on the server)"
    fi
    sleep 5
  done
}

if [ "${1:-}" = "--follow" ]; then
  follow "$("${SSH[@]}" "readlink -f $LATEST")"
  exit $?
fi

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
echo "▸ pushing $BRANCH"
git push origin "$BRANCH"

echo "▸ starting the deploy of $BRANCH on $SERVER"
# Check out the commit first, so the server runs THIS commit's copy of the
# deploy script, then start it in its own session (setsid + nohup): it is no
# child of this SSH connection, so losing the connection cannot stop it.
LOG=$("${SSH[@]}" bash -se <<EOF
set -euo pipefail
cd "$APP_DIR"
git fetch -q origin "$BRANCH"
git checkout -q "$BRANCH"
git reset -q --hard "origin/$BRANCH"
LOG="/tmp/firsthing-deploy-\$(date +%Y%m%d_%H%M%S).log"
: > "\$LOG"
ln -sfn "\$LOG" "$LATEST"
setsid nohup bash scripts/stage-deploy-remote.sh "$BRANCH" "\$LOG" </dev/null >/dev/null 2>&1 &
echo "\$LOG"
EOF
)

follow "$LOG"
