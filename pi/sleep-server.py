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


class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/sleep":
            set_display(False)
            self._json({"status": "sleeping"})
        elif self.path == "/wake":
            set_display(True)
            self._json({"status": "awake"})
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path == "/status":
            self._json({"display": "on" if display_on else "off"})
        else:
            self.send_error(404)

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
