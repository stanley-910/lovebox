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

PULLED=0
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "$(date): pulling $LOCAL → $REMOTE"
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
  echo "$(date): done"
else
  echo "$(date): up to date — dist newer than HEAD, no rebuild"
fi
