#!/usr/bin/env bash
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"

cd ~/lovebox

FORCE=0
if [ "${1:-}" = "--force" ] || [ "${1:-}" = "-f" ]; then
  FORCE=1
fi

# Each line gets prefixed with [HH:MM:SS] so cron-driven log tails are
# easy to scan and a failed run shows up next to the timestamp.
log() { echo "[$(date +%H:%M:%S)] $*"; }

# Banner makes consecutive cron runs visually distinct in the log file.
echo
log "═══ update.sh start (force=$FORCE, pid=$$) ═══"

git fetch origin --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

CHANGED=""
PULLED=0
if [ "$LOCAL" != "$REMOTE" ]; then
  log "pulling ${LOCAL:0:7} → ${REMOTE:0:7}"
  CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")
  log "changed files:"
  echo "$CHANGED" | sed 's/^/    /'
  git merge --ff-only origin/main
  PULLED=1
fi

# Rebuild if we just pulled, if --force, or if dist/ is missing/older than HEAD.
HEAD_TS=$(git log -1 --format=%ct HEAD)
DIST_TS=0
if [ -d dist ]; then
  DIST_TS=$(find dist -type f -printf '%T@\n' 2>/dev/null | sort -nr | head -1 | cut -d. -f1)
  DIST_TS=${DIST_TS:-0}
fi

if [ "$PULLED" = "1" ] || [ "$FORCE" = "1" ] || [ "$DIST_TS" -lt "$HEAD_TS" ]; then
  log "rebuilding (pulled=$PULLED force=$FORCE)"
  # Suppress npm's noise; only show errors. npm ci writes nothing when deps
  # already match package-lock — keeps cron logs clean on frontend-only changes.
  npm ci --silent --no-audit --no-fund 2>&1 | tail -3
  npm run build --silent 2>&1 | tail -3
  sudo systemctl restart lovebox-kiosk
  log "kiosk restarted"
fi

# Pi-side service restarts: only when their own source file changed (or --force).
changed_contains() { echo "$CHANGED" | grep -qxF "$1"; }

if [ "$FORCE" = "1" ] || changed_contains "pi/sleep-server.py"; then
  log "restarting lovebox-sleep"
  sudo systemctl restart lovebox-sleep
fi

if [ "$FORCE" = "1" ] || changed_contains "pi/spotify-service.js"; then
  log "restarting lovebox-spotify"
  sudo systemctl restart lovebox-spotify
fi

if [ "$PULLED" = "0" ] && [ "$FORCE" = "0" ] && [ "$DIST_TS" -ge "$HEAD_TS" ]; then
  log "up to date — no changes (HEAD ${LOCAL:0:7})"
fi

log "─── update.sh done ───"
