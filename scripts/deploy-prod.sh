#!/usr/bin/env bash
# Production deploy, git-based — mirrors deploy-stage.sh exactly, plus the
# one thing stage does not need: a time gate (2026-10-20, user-asked,
# "don't deploy anything on production in day times").
#
#   ./scripts/deploy-prod.sh [branch]        deploy now, but ONLY off-hours IST
#   ./scripts/deploy-prod.sh --now [branch]  deploy regardless of the hour —
#                                            an explicit, stated exception,
#                                            e.g. fixing an active outage
#   ./scripts/deploy-prod.sh --follow        reattach to the latest deploy's log
#
# The deploy itself (build + restart) runs on the server as ONE atomic unit,
# in scripts/prod-deploy-remote.sh — see that script's own comment for why
# the gap between `rm -rf .next` and `pm2 restart` must never be split
# across two separate steps a human pauses between. This script only
# pushes, triggers, and follows the log; a dropped SSH connection cannot
# stop the deploy once it has started.
set -euo pipefail

SERVER="firsthing"
APP_DIR="/firsthing/code/firsthing-dashboard"
LATEST="/tmp/firsthing-prod-deploy-latest.log"
SSH=(ssh -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 "$SERVER")

# The stated off-hours window — late night to early morning IST, when real
# admin/resident use is lowest. Adjust here if the actual window should be
# different; this is a starting default, not a measured one.
OFF_HOURS_START=23  # 11pm IST
OFF_HOURS_END=7     # 7am IST

follow() {
  local log="$1" seen=0 lines
  echo "▸ following $log on $SERVER (the deploy keeps running if this drops)"
  while true; do
    if lines=$("${SSH[@]}" "tail -n +$((seen + 1)) '$log' 2>/dev/null"); then
      if [ -n "$lines" ]; then
        printf '%s\n' "$lines"
        seen=$((seen + $(printf '%s\n' "$lines" | wc -l)))
        if grep -q '^DEPLOY_DONE' <<<"$lines"; then
          echo "▸ deployed — https://www.firsthing.earth"
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

NOW_OVERRIDE=0
if [ "${1:-}" = "--now" ]; then
  NOW_OVERRIDE=1
  shift
fi

if [ "$NOW_OVERRIDE" -eq 0 ]; then
  HOUR=$(TZ="Asia/Kolkata" date +%H)
  HOUR=$((10#$HOUR))
  if [ "$HOUR" -ge "$OFF_HOURS_END" ] && [ "$HOUR" -lt "$OFF_HOURS_START" ]; then
    echo "✗ it is $(TZ="Asia/Kolkata" date "+%H:%M IST") — production deploys are held to"
    echo "  ${OFF_HOURS_START}:00–0${OFF_HOURS_END}:00 IST (adjust the window at the top of this script"
    echo "  if that's wrong). Pass --now to deploy anyway — only for a genuine"
    echo "  reason (an active outage, a DB-only/no-restart change)."
    exit 1
  fi
fi

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
echo "▸ pushing $BRANCH"
git push origin "$BRANCH"

echo "▸ starting the deploy of $BRANCH on $SERVER"
LOG=$("${SSH[@]}" bash -se <<EOF
set -euo pipefail
cd "$APP_DIR"
LOG="/tmp/firsthing-prod-deploy-\$(date +%Y%m%d_%H%M%S).log"
: > "\$LOG"
ln -sfn "\$LOG" "$LATEST"
setsid nohup bash scripts/prod-deploy-remote.sh "$BRANCH" "\$LOG" </dev/null >/dev/null 2>&1 &
echo "\$LOG"
EOF
)

follow "$LOG"
