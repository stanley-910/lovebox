#!/bin/bash
# Lovebox Pi setup — run once on the Pi as root (or with sudo)
# Usage: sudo bash setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
USER_HOME="$(dirname "$(dirname "$SCRIPT_DIR")")"
USERNAME="$(basename "$USER_HOME")"

echo "=== Lovebox Pi Setup ==="

# ── 1. Disable unnecessary services ──
echo ">>> Disabling unnecessary services..."
DISABLE_SERVICES=(
  bluetooth
  hciuart
  cups
  cups-browsed
  triggerhappy
  ModemManager
)

for svc in "${DISABLE_SERVICES[@]}"; do
  if systemctl list-unit-files | grep -q "^${svc}"; then
    systemctl disable --now "$svc" 2>/dev/null || true
    echo "  disabled: $svc"
  fi
done

# ── 2. Disable swap ──
echo ">>> Disabling swap..."
dphys-swapfile swapoff 2>/dev/null || true
systemctl disable dphys-swapfile 2>/dev/null || true

# ── 3. Reduce GPU memory (enough for 2D compositing) ──
echo ">>> Setting GPU memory to 64MB..."
if grep -q "^gpu_mem=" /boot/firmware/config.txt 2>/dev/null; then
  sed -i 's/^gpu_mem=.*/gpu_mem=64/' /boot/firmware/config.txt
elif grep -q "^gpu_mem=" /boot/config.txt 2>/dev/null; then
  sed -i 's/^gpu_mem=.*/gpu_mem=64/' /boot/config.txt
else
  CONFIG_FILE="/boot/firmware/config.txt"
  [ -f "$CONFIG_FILE" ] || CONFIG_FILE="/boot/config.txt"
  echo "gpu_mem=64" >> "$CONFIG_FILE"
fi

# ── 4. Disable screen blanking ──
echo ">>> Disabling screen blanking..."
CMDLINE="/boot/firmware/cmdline.txt"
[ -f "$CMDLINE" ] || CMDLINE="/boot/cmdline.txt"
grep -q "consoleblank=0" "$CMDLINE" 2>/dev/null || \
  sed -i 's/$/ consoleblank=0/' "$CMDLINE" 2>/dev/null || true

# ── 5. Install kiosk service ──
echo ">>> Installing kiosk service..."
cp "$SCRIPT_DIR/lovebox-kiosk.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable lovebox-kiosk

# ── 6. Install sleep server ──
echo ">>> Installing sleep server..."
cp "$SCRIPT_DIR/lovebox-sleep.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now lovebox-sleep

# ── 7. Hide mouse cursor ──
echo ">>> Installing unclutter (hide cursor)..."
apt-get install -y unclutter 2>/dev/null || true

AUTOSTART_DIR="$USER_HOME/.config/lxsession/LXDE-pi"
mkdir -p "$AUTOSTART_DIR"
AUTOSTART="$AUTOSTART_DIR/autostart"
grep -q "unclutter" "$AUTOSTART" 2>/dev/null || \
  echo "@unclutter -idle 0.5 -root" >> "$AUTOSTART"

echo ""
echo "=== Done ==="
echo "Reboot to start kiosk: sudo reboot"
echo ""
echo "Services installed:"
echo "  lovebox-kiosk  — Chromium kiosk (edit URL in /etc/systemd/system/lovebox-kiosk.service)"
echo "  lovebox-sleep  — Display sleep/wake server on :8888"
echo ""
echo "To point kiosk at your dev Mac:"
echo "  sudo sed -i 's|http://.*|http://<mac-ip>:3000|' /etc/systemd/system/lovebox-kiosk.service"
echo "  sudo systemctl daemon-reload && sudo systemctl restart lovebox-kiosk"
