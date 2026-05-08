#!/bin/bash
#
# Point the Pi's Chromium kiosk at a custom URL (e.g. your Mac's Vite dev
# server) for live CSS/JS iteration without git-push + rebuild round-trips.
#
# Usage on the Pi:
#   ./pi/kiosk-dev.sh                        # auto-detect SSH client IP, port 3000
#   ./pi/kiosk-dev.sh http://192.168.1.42:3000
#   ./pi/kiosk-dev.sh 192.168.1.42           # short form, assumes :3000
#
# Or from your Mac, all in one line:
#   ssh -t stanley@lovebox.local '~/lovebox/pi/kiosk-dev.sh'
#
# Stops `lovebox-kiosk`, launches chromium pointed at the URL, and on Ctrl+C
# (or any exit) restores the normal kiosk service.

set -e

URL_ARG="$1"

if [ -z "$URL_ARG" ]; then
  # Auto-detect: use the IP of whoever SSH'd in.
  if [ -n "$SSH_CLIENT" ]; then
    CLIENT_IP=$(echo "$SSH_CLIENT" | awk '{print $1}')
    URL="http://${CLIENT_IP}:3000"
    echo "[kiosk-dev] auto-detected SSH client → $URL"
  else
    echo "Usage: $0 <url-or-host>" >&2
    echo "  (or run via SSH and the client IP is auto-detected)" >&2
    exit 1
  fi
elif [[ "$URL_ARG" == http* ]]; then
  URL="$URL_ARG"
else
  URL="http://${URL_ARG}:3000"
fi

cleanup() {
  echo
  echo "[kiosk-dev] restoring lovebox-kiosk service..."
  pkill -f "chromium.*${URL}" 2>/dev/null || true
  sudo systemctl start lovebox-kiosk
  echo "[kiosk-dev] done."
}
trap cleanup EXIT INT TERM

echo "[kiosk-dev] stopping lovebox-kiosk..."
sudo systemctl stop lovebox-kiosk

echo "[kiosk-dev] launching chromium → $URL"
echo "[kiosk-dev] press Ctrl+C here to restore the normal kiosk."
echo

DISPLAY=:0 XAUTHORITY=/home/stanley/.Xauthority chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-extensions \
  --disable-session-crashed-bubble \
  --password-store=basic \
  --no-first-run \
  --no-default-browser-check \
  --disable-translate \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  "$URL"
