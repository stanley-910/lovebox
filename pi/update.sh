#!/usr/bin/env bash
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"

cd ~/lovebox

FORCE=0
if [ "${1:-}" = "--force" ] || [ "${1:-}" = "-f" ]; then
  FORCE=1
fi

git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

CHANGED=""
PULLED=0
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "$(date): pulling $LOCAL → $REMOTE"
  CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")
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
  echo "$(date): building (pulled=$PULLED force=$FORCE dist_ts=$DIST_TS head_ts=$HEAD_TS)"
  npm ci
  npm run build
  sudo systemctl restart lovebox-kiosk
  echo "$(date): kiosk restarted"
fi

# Pi-side service restarts: only when their own source file changed (or --force).
changed_contains() { echo "$CHANGED" | grep -qxF "$1"; }

if [ "$FORCE" = "1" ] || changed_contains "pi/sleep-server.py"; then
  echo "$(date): restarting lovebox-sleep"
  sudo systemctl restart lovebox-sleep
fi

if [ "$FORCE" = "1" ] || changed_contains "pi/spotify-service.js"; then
  echo "$(date): restarting lovebox-spotify"
  sudo systemctl restart lovebox-spotify
fi

if [ "$PULLED" = "0" ] && [ "$FORCE" = "0" ] && [ "$DIST_TS" -ge "$HEAD_TS" ]; then
  echo "$(date): up to date — no changes"
fi
