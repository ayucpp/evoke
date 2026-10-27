#!/usr/bin/env python3
"""
ESP32 4x4 Keypad - Bluetooth Background Receiver & Web Display

This script runs on your laptop to:
1. Automatically discover and connect to the ESP32 ("ESP32_Keypad") in the background.
2. Auto-reconnect seamlessly whenever the ESP32 turns on or comes into range.
3. Serve a live web dashboard at http://localhost:5000 showing pressed keys, sequence buffer,
   interactive 4x4 matrix mirror, and keystroke logs.
4. Provide real-time console telemetry.

Zero external dependencies required (uses standard Python 3 libraries).
"""

import os
import sys
import time
import json
import socket
import select
import re
import argparse
import threading
import subprocess
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Target Bluetooth Device Name
TARGET_DEVICE_NAME = "ESP32_Keypad"
CACHE_MAC_FILE = Path(__file__).parent / ".esp32_mac"

# Shared Application State
app_state = {
    "connected": False,
    "device_mac": None,
    "device_name": TARGET_DEVICE_NAME,
    "lastKey": "",
    "buffer": "",
    "count": 0,
    "uptime": 0,
    "last_seen": 0,
    "history": []
}
state_lock = threading.Lock()
bt_active_socket = None


def get_cached_mac():
    """Retrieve cached MAC address if available."""
    if CACHE_MAC_FILE.exists():
        try:
            mac = CACHE_MAC_FILE.read_text().strip()
            if re.match(r"^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$", mac):
                return mac
        except Exception:
            pass
    return None


def save_cached_mac(mac):
    """Save discovered MAC address for fast subsequent connections."""
    try:
        CACHE_MAC_FILE.write_text(mac.strip())
    except Exception as e:
        print(f"[!] Warning: Could not cache MAC: {e}", file=sys.stderr)


def check_rfkill():
    """Check if Bluetooth is soft-blocked by rfkill and notify user."""
    try:
        result = subprocess.run(["rfkill", "list", "bluetooth"], capture_output=True, text=True)
        if "Soft blocked: yes" in result.stdout:
            print("[!] NOTICE: Bluetooth appears to be soft-blocked on your laptop.")
            print("[!] Please run: sudo rfkill unblock bluetooth")
            print("[!] Attempting automatic unblock...")
            subprocess.run(["rfkill", "unblock", "bluetooth"], capture_output=True)
    except Exception:
        pass


def discover_esp32_mac(timeout_sec=8):
    """Search for ESP32_Keypad using bluetoothctl or cached devices."""
    cached = get_cached_mac()
    if cached:
        print(f"[*] Found cached ESP32 MAC address: {cached}")
        return cached

    print(f"[*] Searching for Bluetooth device \"{TARGET_DEVICE_NAME}\" (timeout: {timeout_sec}s)...")
    check_rfkill()

    # 1. Check already paired/known devices
    try:
        res = subprocess.run(["bluetoothctl", "devices"], capture_output=True, text=True, timeout=3)
        for line in res.stdout.splitlines():
            if TARGET_DEVICE_NAME.lower() in line.lower():
                parts = line.split()
                if len(parts) >= 2 and re.match(r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$", parts[1]):
                    mac = parts[1]
                    print(f"[+] Found existing device in bluetoothctl: {mac}")
                    save_cached_mac(mac)
                    return mac
    except Exception:
        pass

    # 2. Run active discovery scan
    try:
        scan_proc = subprocess.Popen(["bluetoothctl", "scan", "on"],
                                     stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL,
                                     text=True)
        start_time = time.time()
        discovered_mac = None

        while time.time() - start_time < timeout_sec:
            line = scan_proc.stdout.readline()
            if not line and scan_proc.poll() is not None:
                break
            if TARGET_DEVICE_NAME.lower() in line.lower():
                match = re.search(r"([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}", line)
                if match:
                    discovered_mac = match.group(0)
                    print(f"[+] Discovered \"{TARGET_DEVICE_NAME}\" at MAC: {discovered_mac}")
                    break
            time.sleep(0.05)

        scan_proc.terminate()
        try:
            scan_proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            scan_proc.kill()

        if discovered_mac:
            save_cached_mac(discovered_mac)
            return discovered_mac
    except Exception as e:
        print(f"[!] Scan error: {e}", file=sys.stderr)

    return None


def pair_and_trust(mac):
    """Pair and trust the device using bluetoothctl so auto-connection works smoothly."""
    try:
        subprocess.run(["bluetoothctl", "trust", mac], capture_output=True, timeout=3)
        subprocess.run(["bluetoothctl", "pair", mac], capture_output=True, timeout=5)
    except Exception:
        pass


def load_web_page_html():
    """Load HTML dashboard from web_page.h or use embedded fallback."""
    possible_paths = [
        Path(__file__).parent / "esp32_keypad_web" / "web_page.h",
        Path(__file__).parent / "web_page.h"
    ]
    for p in possible_paths:
        if p.exists():
            try:
                content = p.read_text(encoding="utf-8")
                start_tag = 'R"rawliteral(\n'
                end_tag = '\n)rawliteral";'
                s_idx = content.find(start_tag)
                e_idx = content.find(end_tag)
                if s_idx != -1 and e_idx != -1:
                    raw_html = content[s_idx + len(start_tag):e_idx]
                    # Update title to indicate Bluetooth connection
                    raw_html = raw_html.replace(
                        "Live Matrix Keypad Telemetry & Buffer Stream",
                        "Live Matrix Keypad &bull; Bluetooth Connection"
                    )
                    return raw_html
            except Exception as e:
                print(f"[!] Could not parse {p}: {e}")
                break

    # Minimal fallback HTML if file is missing
    return """<!DOCTYPE html>
<html>
<head><title>ESP32 Bluetooth Keypad</title></head>
<body style="background:#0f172a;color:#fff;font-family:sans-serif;text-align:center;padding:2rem;">
  <h1>ESP32 Keypad - Bluetooth Monitor</h1>
  <h2 id="key" style="font-size:4rem;color:#38bdf8;">-</h2>
  <p id="buf" style="font-size:1.5rem;letter-spacing:0.1em;"></p>
  <script>
    setInterval(async () => {
      const res = await fetch('/api/data');
      const d = await res.json();
      document.getElementById('key').textContent = d.lastKey || '-';
      document.getElementById('buf').textContent = d.buffer || '';
    }, 100);
  </script>
</body>
</html>"""


HTML_PAYLOAD = load_web_page_html()


# ==============================================================================
# Web Server Request Handler
# ==============================================================================
class KeypadHttpHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_PAYLOAD.encode("utf-8"))
        elif self.path == "/api/data":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with state_lock:
                data = {
                    "connected": app_state["connected"],
                    "mac": app_state["device_mac"],
                    "lastKey": app_state["lastKey"],
                    "buffer": app_state["buffer"],
                    "count": app_state["count"],
                    "uptime": int((time.time() - app_state["last_seen"]) * 1000) if app_state["last_seen"] else 0
                }
            self.wfile.write(json.dumps(data).encode("utf-8"))
        elif self.path == "/api/clear":
            self.handle_clear()
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/api/clear":
            self.handle_clear()
        else:
            self.send_response(404)
            self.end_headers()

    def handle_clear(self):
        global bt_active_socket
        with state_lock:
            app_state["buffer"] = ""
            app_state["lastKey"] = ""
        # Send CLEAR command to ESP32 over Bluetooth
        if bt_active_socket:
            try:
                bt_active_socket.sendall(b"CLEAR\n")
            except Exception:
                pass
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b'{"status":"cleared","ok":true}')

    def log_message(self, format, *args):
        # Silence standard HTTP polling logs to keep terminal clean
        return


def start_web_server(port=5000):
    server = ThreadingHTTPServer(("0.0.0.0", port), KeypadHttpHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    return server


# ==============================================================================
# Bluetooth Background Worker
# ==============================================================================
def parse_and_update(raw_line):
    """Parse incoming JSON or plain string from ESP32 Bluetooth."""
    raw_line = raw_line.strip()
    if not raw_line:
        return

    now = time.time()
    try:
        payload = json.loads(raw_line)
        key = payload.get("key", "")
        buf = payload.get("buffer", "")
        cnt = payload.get("count", 0)

        with state_lock:
            app_state["lastKey"] = key
            app_state["buffer"] = buf
            app_state["count"] = cnt
            app_state["last_seen"] = now

        print(f"\r[BLUETOOTH] Key: \033[1;33m[{key}]\033[0m | Buffer: \033[1;36m{buf}\033[0m | Total: {cnt}   ", end="", flush=True)

    except json.JSONDecodeError:
        # Fallback if raw text character was sent
        key = raw_line[:1]
        with state_lock:
            app_state["lastKey"] = key
            app_state["buffer"] += key
            app_state["count"] += 1
            app_state["last_seen"] = now
        print(f"\r[BLUETOOTH] Key: \033[1;33m[{key}]\033[0m | Raw: {raw_line}   ", end="", flush=True)


def bluetooth_worker_loop(target_mac=None):
    """Background worker that continuously scans, connects, and reconnects."""
    global bt_active_socket

    print("[*] Bluetooth auto-connect worker thread started.")

    while True:
        # Step 1: Ensure we have target MAC address
        mac = target_mac or get_cached_mac()
        if not mac:
            mac = discover_esp32_mac(timeout_sec=6)
            if not mac:
                print("\r[*] Searching for ESP32_Keypad... (Turn on ESP32)", end="", flush=True)
                time.sleep(2.5)
                continue

        with state_lock:
            app_state["device_mac"] = mac

        # Step 2: Attempt connection
        print(f"\n[*] Connecting to ESP32 via Bluetooth ({mac})...")
        pair_and_trust(mac)

        sock = None
        try:
            # Check native socket support
            sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
            sock.settimeout(5.0)
            sock.connect((mac, 1)) # RFCOMM Channel 1
            sock.settimeout(None)

            bt_active_socket = sock
            with state_lock:
                app_state["connected"] = True

            print(f"\033[1;32m[✓] CONNECTED to ESP32_Keypad ({mac})!\033[0m")
            print("[*] Press keys on the matrix keypad. View live at: http://localhost:5000\n")

            # Reading loop
            buffer_data = ""
            while True:
                chunk = sock.recv(1024)
                if not chunk:
                    break
                buffer_data += chunk.decode("utf-8", errors="replace")
                while "\n" in buffer_data:
                    line, buffer_data = buffer_data.split("\n", 1)
                    parse_and_update(line)

        except (socket.error, OSError, Exception) as e:
            # Connection failed or dropped
            pass
        finally:
            if sock:
                try:
                    sock.close()
                except Exception:
                    pass
            bt_active_socket = None
            with state_lock:
                app_state["connected"] = False

        print("\n\033[1;31m[!] ESP32 disconnected.\033[0m Waiting for ESP32 to reconnect in background...")
        time.sleep(2.0)


# ==============================================================================
# Main Entry Point
# ==============================================================================
def main():
    parser = argparse.ArgumentParser(description="ESP32 4x4 Keypad Bluetooth Receiver & Web Server")
    parser.add_argument("--mac", help="ESP32 Bluetooth MAC address (optional, will auto-scan if omitted)")
    parser.add_argument("--port", type=int, default=5000, help="Web server port (default: 5000)")
    parser.add_argument("--reset-mac", action="store_true", help="Clear cached MAC address and force re-scan")
    args = parser.parse_args()

    if args.reset_mac and CACHE_MAC_FILE.exists():
        CACHE_MAC_FILE.unlink()
        print("[*] Cleared cached Bluetooth MAC address.")

    if args.mac:
        save_cached_mac(args.mac)

    print("=" * 64)
    print("   ESP32 4x4 Matrix Keypad - Bluetooth Background Receiver")
    print("=" * 64)

    # Start local Web Server
    try:
        start_web_server(args.port)
        print(f"[✓] Live Web Dashboard running at: \033[1;34mhttp://localhost:{args.port}\033[0m")
    except Exception as e:
        print(f"[!] Warning: Could not start web server on port {args.port}: {e}")

    # Launch Bluetooth auto-connect worker thread
    bt_thread = threading.Thread(target=bluetooth_worker_loop, args=(args.mac,), daemon=True)
    bt_thread.start()

    # Main thread keeps running and handles Ctrl+C cleanly
    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[*] Exiting Bluetooth receiver. Goodbye!")
        sys.exit(0)


if __name__ == "__main__":
    main()
