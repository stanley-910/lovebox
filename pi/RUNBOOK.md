# Lovebox Pi Runbook

Operational reference for the four `lovebox-*` services running on the Pi. SSH in first:

```bash
ssh stanley@lovebox.local
```

## Services at a glance

| Service | User | Port | Purpose | Restart effect |
|---------|------|------|---------|----------------|
| `lovebox-serve` | `stanley` | 3000 | Serves built `dist/` to Chromium | Brief blank screen in kiosk |
| `lovebox-kiosk` | `stanley` | — | Chromium fullscreen → `localhost:3000` | Full screen flash, ~5s reload |
| `lovebox-sleep` | `root` | 8888 | Display sleep/wake + wake-on-touch + Wi-Fi endpoints | Sleep button stops working briefly |
| `lovebox-spotify` | `stanley` | — | Spotify polling + queue-hijack execution | Music tab goes stale ~10s |

## Universal commands

Substitute `<svc>` with one of: `lovebox-kiosk`, `lovebox-serve`, `lovebox-sleep`, `lovebox-spotify`.

```bash
# Status (running? last restart? exit code?)
sudo systemctl status <svc>

# Restart
sudo systemctl restart <svc>

# Live logs (tail -f equivalent)
journalctl -u <svc> -f

# Last 50 lines, no pager (good for SSH one-liners)
journalctl -u <svc> -n 50 --no-pager

# Logs since a time
journalctl -u <svc> --since '10 min ago' --no-pager
journalctl -u <svc> --since today --no-pager

# Disable/enable on boot
sudo systemctl disable <svc>
sudo systemctl enable <svc>
```

Run from your Mac without a full SSH session:

```bash
ssh stanley@lovebox.local 'sudo systemctl restart lovebox-spotify'
ssh stanley@lovebox.local 'journalctl -u lovebox-spotify -n 30 --no-pager'
```

## Service-specific

### `lovebox-serve` — static file server

```bash
sudo systemctl restart lovebox-serve
journalctl -u lovebox-serve -n 30 --no-pager
curl -I http://localhost:3000      # quick health check from on the Pi
```

If 404s on assets after a deploy, the build probably failed — check `~/lovebox/dist/` exists and contains an `assets/` folder. Rebuild with:

```bash
cd ~/lovebox && source ~/.nvm/nvm.sh && npm ci && npm run build
sudo systemctl restart lovebox-serve
```

### `lovebox-kiosk` — Chromium

Kiosk runs as user `stanley` with `DISPLAY=:0`. To reset the visible UI:

```bash
sudo systemctl restart lovebox-kiosk
```

Note: this one has the known passwordless-sudo gap (`update.sh` can't restart it from cron). After a `git pull` you usually want `restart lovebox-serve` (picks up new built assets) + `restart lovebox-kiosk` (forces Chromium reload).

If the screen is frozen but services are healthy, just touch the screen — Chromium often just needs a paint kick. If the touch input is dead, the kiosk process probably died:

```bash
journalctl -u lovebox-kiosk -n 100 --no-pager
```

GPU warnings (`GLES3 is unsupported`) are harmless on the Pi 3B+.

### `lovebox-sleep` — display + Wi-Fi HTTP server

Runs as root (needed for `vcgencmd display_power` and `nmcli`). Listens on `127.0.0.1:8888`.

```bash
sudo systemctl restart lovebox-sleep
journalctl -u lovebox-sleep -n 30 --no-pager

# Manual probes (run on the Pi):
curl http://127.0.0.1:8888/status
curl http://127.0.0.1:8888/wifi/status
curl http://127.0.0.1:8888/wifi/scan
curl -X POST http://127.0.0.1:8888/wake
curl -X POST http://127.0.0.1:8888/sleep
curl -X POST -H 'Content-Type: application/json' \
  -d '{"ssid":"NetName","password":"hunter2"}' \
  http://127.0.0.1:8888/wifi/connect
```

If `/wifi/*` returns `nmcli not installed`, install it:

```bash
sudo apt install network-manager
```

If wake-on-touch stops working, check the input watcher started:

```bash
journalctl -u lovebox-sleep | grep watching
```

Should list `/dev/input/event*` devices. If empty, the user `root` can't read them (shouldn't happen as root, but worth checking after kernel upgrades).

### `lovebox-spotify` — polling + commands

Reads tokens from `~/.lovebox-spotify-{him,her}.json`. Crashes on startup if neither exists.

```bash
sudo systemctl restart lovebox-spotify
journalctl -u lovebox-spotify -n 50 --no-pager
journalctl -u lovebox-spotify -f       # watch live during testing
```

Healthy log pattern (every ~5 min):
```
[poll] 30 cycles completed
[poll] 60 cycles completed
```

Command execution shows up as:
```
[cmd] queue → her: spotify:track:...
[cmd] <docId> executed
```

**Common failures (now log clean lines instead of crashing):**

| Log line | Meaning | Fix |
|----------|---------|-----|
| `[her] currently-playing status=403 body=The user is not registered…` | Spotify dev-mode allowlist missing the user | Add the account at developer.spotify.com/dashboard → Settings → User Management, then restart |
| `[her] currently-playing status=401` | Refresh token revoked or scopes changed | Re-run `spotify-auth.js her` to mint a fresh token |
| `[her] poll error: ...` | Network or Firestore issue | Check connectivity, then `journalctl` for full stack |
| `[her] token refresh failed: status=400 body=...` | Refresh token invalid | Re-run `spotify-auth.js her` |
| `[her] no token file — skipping` | Token file missing — service still runs for the other user | Run `spotify-auth.js her` if you want her account polled |

Re-running OAuth (one user at a time — port 8888 conflict):

```bash
sudo systemctl stop lovebox-sleep
cd ~/lovebox && source ~/.nvm/nvm.sh
SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node pi/spotify-auth.js her
# open http://127.0.0.1:8888/login on the Pi browser, sign in as Sam
sudo systemctl start lovebox-sleep
sudo systemctl restart lovebox-spotify
```

## Deploy / pull latest code

`update.sh` runs every 5 min via cron. To force it now:

```bash
cd ~/lovebox && ./pi/update.sh
```

It runs `git pull` → `npm ci` → `npm run build` → tries to restart `lovebox-kiosk` (this last step fails silently from cron due to sudo). After a manual run, also do:

```bash
sudo systemctl restart lovebox-serve   # pick up new dist/
sudo systemctl restart lovebox-kiosk   # reload Chromium
```

If you changed Pi-side code (`pi/sleep-server.py`, `pi/spotify-service.js`) the matching service needs a restart too — they don't reload on file change.

## See everything at once

```bash
# All four services' status
for s in lovebox-serve lovebox-kiosk lovebox-sleep lovebox-spotify; do
  echo "=== $s ==="
  systemctl is-active $s
done

# Recent logs across all four
journalctl -u 'lovebox-*' -n 100 --no-pager

# Live tail across all four
journalctl -u 'lovebox-*' -f
```

## Live dev mode (point Pi at your Mac's Vite server)

For iterating on CSS/JS without git push + rebuild round-trips. Vite already binds `0.0.0.0:3000`, so it's reachable on the LAN.

On your Mac:
```bash
npm run dev               # confirm it prints "Network: http://192.168.x.y:3000/"
```

Then from your Mac, in one line (auto-detects your IP via `$SSH_CLIENT`):
```bash
ssh -t stanley@lovebox.local '~/lovebox/pi/kiosk-dev.sh'
```

Or pass an explicit URL:
```bash
ssh -t stanley@lovebox.local '~/lovebox/pi/kiosk-dev.sh http://192.168.1.42:3000'
```

The script stops `lovebox-kiosk`, launches Chromium pointed at your Mac, and **on Ctrl+C restores the normal kiosk service**. Vite HMR pushes changes straight to the Pi screen on save.

Caveats:
- Your Mac's `.env` decides which user is signed in (set Sam's creds to test as her).
- Wi-Fi panel will show "wi-fi unavailable" — the kiosk is now hitting your Mac's port 8888, where nothing is listening. Expected.
- macOS may prompt to allow incoming connections for Node — say yes.

## Reboot the Pi

Last resort, but cleanly brings everything back up:

```bash
sudo reboot
```

All services have `Restart=always` (or `on-failure` for kiosk) and start on boot, so nothing manual needed after.
