#!/usr/bin/env python3
"""Tiny HTTP server for display power control. Runs on the Pi."""

import http.server
import subprocess
import json
import threading
import struct
import os
import glob
import time as _time

PORT = 8888
display_on = True
wake_lock = threading.Lock()
sleep_time = 0


def set_display(on):
    global display_on, sleep_time
    val = "1" if on else "0"
    subprocess.run(["vcgencmd", "display_power", val], check=False)
    display_on = on
    if not on:
        sleep_time = _time.monotonic()


def find_input_devices():
    devices = []
    for path in sorted(glob.glob("/dev/input/event*")):
        try:
            open(path, "rb").close()
            devices.append(path)
        except PermissionError:
            continue
    return devices


def watch_device(dev):
    """Block-read a single input device; wake display on any event."""
    EVENT_SIZE = struct.calcsize("llHHI")
    while True:
        try:
            with open(dev, "rb") as f:
                while True:
                    f.read(EVENT_SIZE)
                    with wake_lock:
                        if not display_on and (_time.monotonic() - sleep_time) > 2:
                            print(f"[sleep-server] input on {dev}, waking display")
                            set_display(True)
        except Exception as e:
            print(f"[sleep-server] watch error on {dev}: {e}, retrying in 5s")
            import time
            time.sleep(5)


def watch_all_inputs():
    """Spawn a watcher thread per input device."""
    devices = find_input_devices()
    if not devices:
        print("[sleep-server] no input devices found, wake-on-input disabled")
        return
    for dev in devices:
        print(f"[sleep-server] watching {dev}")
        t = threading.Thread(target=watch_device, args=(dev,), daemon=True)
        t.start()


def _nmcli(args, timeout=15):
    """Run nmcli with args (list, never shell). Returns (returncode, stdout, stderr)."""
    try:
        r = subprocess.run(
            ["nmcli"] + args,
            capture_output=True, text=True, timeout=timeout, check=False,
        )
        return r.returncode, r.stdout, r.stderr
    except FileNotFoundError:
        return 127, "", "nmcli not installed"
    except subprocess.TimeoutExpired:
        return 124, "", "nmcli timeout"


def _parse_terse(line):
    """nmcli -t escapes ':' as '\\:' and '\\' as '\\\\'. Split on unescaped ':'."""
    out, buf, i = [], "", 0
    while i < len(line):
        c = line[i]
        if c == "\\" and i + 1 < len(line):
            buf += line[i + 1]
            i += 2
        elif c == ":":
            out.append(buf); buf = ""; i += 1
        else:
            buf += c; i += 1
    out.append(buf)
    return out


def wifi_status():
    rc, out, _ = _nmcli(["-t", "-f", "ACTIVE,SSID,SIGNAL", "device", "wifi"])
    ssid, signal = None, 0
    if rc == 0:
        for line in out.splitlines():
            parts = _parse_terse(line)
            if len(parts) >= 3 and parts[0] == "yes":
                ssid = parts[1] or None
                try: signal = int(parts[2])
                except ValueError: signal = 0
                break
    ip = None
    try:
        r = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=3)
        ip = (r.stdout.split() or [None])[0]
    except Exception:
        pass
    return {"ssid": ssid, "signal": signal, "ip": ip}


def wifi_scan():
    _nmcli(["device", "wifi", "rescan"], timeout=10)
    rc, out, err = _nmcli(["-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list"])
    if rc != 0:
        return {"error": err.strip() or "scan failed", "networks": []}
    seen, nets = set(), []
    for line in out.splitlines():
        parts = _parse_terse(line)
        if len(parts) < 4: continue
        in_use, ssid, sig, sec = parts[0], parts[1], parts[2], parts[3]
        if not ssid or ssid in seen: continue
        seen.add(ssid)
        try: sig = int(sig)
        except ValueError: sig = 0
        nets.append({
            "ssid": ssid,
            "signal": sig,
            "security": sec or "",
            "in_use": in_use == "*",
        })
    nets.sort(key=lambda n: (-1 if n["in_use"] else 0, -n["signal"]))
    return {"networks": nets}


def wifi_connect(ssid, password):
    if not ssid:
        return {"ok": False, "error": "missing ssid"}
    args = ["device", "wifi", "connect", ssid]
    if password:
        args += ["password", password]
    rc, out, err = _nmcli(args, timeout=45)
    if rc == 0:
        return {"ok": True}
    msg = (err or out).strip().splitlines()[-1] if (err or out).strip() else "connection failed"
    return {"ok": False, "error": msg}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/sleep":
            set_display(False)
            self._json({"status": "sleeping"})
        elif self.path == "/wake":
            set_display(True)
            self._json({"status": "awake"})
        elif self.path == "/wifi/connect":
            body = self._read_json()
            self._json(wifi_connect((body or {}).get("ssid"), (body or {}).get("password", "")))
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path == "/status":
            self._json({"display": "on" if display_on else "off"})
        elif self.path == "/wifi/status":
            self._json(wifi_status())
        elif self.path == "/wifi/scan":
            self._json(wifi_scan())
        else:
            self.send_error(404)

    def _read_json(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0: return {}
            return json.loads(self.rfile.read(n).decode() or "{}")
        except Exception:
            return {}

    def _json(self, obj):
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def log_message(self, fmt, *args):
        print(f"[sleep-server] {fmt % args}")


if __name__ == "__main__":
    watch_all_inputs()

    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[sleep-server] listening on :{PORT}")
    server.serve_forever()
