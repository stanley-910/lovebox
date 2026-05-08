#!/usr/bin/env bash
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"

cd ~/lovebox

git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "$(date): updating $LOCAL → $REMOTE"
  git merge --ff-only origin/main || exit 1
  npm ci
  npm run build
  sudo systemctl restart lovebox-kiosk
  echo "$(date): done"
fi
