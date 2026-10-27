#!/usr/bin/env python3
"""
EVOKE — Bluetooth Bridge & Hardware Integration Backend

Connects to the ESP32 4x4 Keypad over Bluetooth Classic (RFCOMM/SPP),
auto-discovers and reconnects, emits structured JSON events to Electron over stdout,
and executes system keyboard shortcuts via pynput.
"""

import os
import sys
import time
import json
import socket
import select
import re
import threading
import subprocess
from pathlib import Path

# Setup paths and imports
BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_MAC_FILE = BASE_DIR / ".esp32_mac"

# Target Bluetooth Device Name
TARGET_DEVICE_NAME = "ESP32_Keypad"

# Global state
app_state = {
    "connected": False,
    "device_mac": None,
    "device_name": TARGET_DEVICE_NAME,
    "state": "disconnected",  # "disconnected" | "scanning" | "connecting" | "connected"
    "lastKey": "",
    "buffer": "",
    "count": 0,
    "uptime": 0,
    "last_seen": 0,
}
state_lock = threading.Lock()
bt_active_socket = None
should_run = True

# Keyboard controller for shortcut execution
keyboard_controller = None
try:
    from pynput.keyboard import Controller, Key, KeyCode
    keyboard_controller = Controller()
except Exception as e:
    # On environments without X11 or pynput, will report error when shortcut is invoked
    keyboard_controller = None


def emit_json(payload):
    """Write single-line JSON to stdout and flush immediately."""
    try:
        line = json.dumps(payload, separators=(',', ':'))
        sys.stdout.write(line + "\n")
        sys.stdout.flush()
    except Exception:
        pass


def log(level, message):
    """Emit structured log message to Electron."""
    emit_json({
        "type": "log",
        "level": level,
        "message": str(message),
        "timestamp": time.time()
    })


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
        log("warn", f"Could not cache MAC: {e}")


def check_rfkill():
    """Check if Bluetooth is soft-blocked and try to unblock."""
    try:
        result = subprocess.run(["rfkill", "list", "bluetooth"], capture_output=True, text=True, timeout=2)
        if "Soft blocked: yes" in result.stdout:
            log("warn", "Bluetooth is soft-blocked. Attempting unblock...")
            subprocess.run(["rfkill", "unblock", "bluetooth"], capture_output=True, timeout=2)
    except Exception:
        pass


def discover_esp32_mac(timeout_sec=6):
    """Search for ESP32_Keypad using bluetoothctl or cached devices."""
    cached = get_cached_mac()
    if cached:
        log("info", f"Using cached ESP32 MAC address: {cached}")
        return cached

    log("info", f"Searching for Bluetooth device \"{TARGET_DEVICE_NAME}\" (timeout: {timeout_sec}s)...")
    check_rfkill()

    # 1. Check already paired/known devices
    try:
        res = subprocess.run(["bluetoothctl", "devices"], capture_output=True, text=True, timeout=3)
        for line in res.stdout.splitlines():
            if TARGET_DEVICE_NAME.lower() in line.lower():
                parts = line.split()
                if len(parts) >= 2 and re.match(r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$", parts[1]):
                    mac = parts[1]
                    log("info", f"Found existing device in bluetoothctl: {mac}")
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
                    log("info", f"Discovered \"{TARGET_DEVICE_NAME}\" at MAC: {discovered_mac}")
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
        log("warn", f"Scan error: {e}")

    return None


def pair_and_trust(mac):
    """Pair and trust the device using bluetoothctl."""
    try:
        subprocess.run(["bluetoothctl", "trust", mac], capture_output=True, timeout=3)
        subprocess.run(["bluetoothctl", "pair", mac], capture_output=True, timeout=4)
    except Exception:
        pass


def update_and_emit_status(state, connected=None, mac=None):
    """Update global connection status and emit event to Electron."""
    with state_lock:
        app_state["state"] = state
        if connected is not None:
            app_state["connected"] = connected
        if mac is not None:
            app_state["device_mac"] = mac
        current_status = {
            "type": "status",
            "connected": app_state["connected"],
            "state": app_state["state"],
            "mac": app_state["device_mac"],
            "device_name": app_state["device_name"],
            "timestamp": time.time()
        }
    emit_json(current_status)


def parse_and_dispatch_key(raw_line):
    """Parse incoming JSON or raw string from ESP32 Bluetooth."""
    raw_line = raw_line.strip()
    if not raw_line:
        return

    now = time.time()
    key = ""
    buf = ""
    cnt = 0
    uptime = 0

    try:
        payload = json.loads(raw_line)
        key = str(payload.get("key", ""))
        buf = str(payload.get("buffer", ""))
        cnt = int(payload.get("count", 0))
        uptime = int(payload.get("uptime", 0))
    except json.JSONDecodeError:
        key = raw_line[:1]
        buf = raw_line
        cnt = 1
        uptime = 0

    if not key:
        return

    with state_lock:
        app_state["lastKey"] = key
        app_state["buffer"] = buf
        app_state["count"] = cnt
        app_state["uptime"] = uptime
        app_state["last_seen"] = now

    # Emit key event to Electron main process
    emit_json({
        "type": "key",
        "key": key,
        "buffer": buf,
        "count": cnt,
        "uptime": uptime,
        "timestamp": now
    })


def bluetooth_worker_loop():
    """Background loop that connects and maintains the RFCOMM Bluetooth stream."""
    global bt_active_socket, should_run

    while should_run:
        mac = None
        with state_lock:
            mac = app_state["device_mac"]

        if not mac:
            mac = get_cached_mac()

        if not mac:
            update_and_emit_status("scanning", connected=False)
            mac = discover_esp32_mac(timeout_sec=5)
            if not mac:
                # Sleep briefly before trying again
                time.sleep(3.0)
                continue

        update_and_emit_status("connecting", connected=False, mac=mac)
        log("info", f"Connecting to ESP32 via Bluetooth ({mac})...")
        pair_and_trust(mac)

        sock = None
        try:
            sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
            sock.settimeout(5.0)
            sock.connect((mac, 1))  # RFCOMM Channel 1
            sock.settimeout(None)

            bt_active_socket = sock
            update_and_emit_status("connected", connected=True, mac=mac)
            log("info", f"Connected to ESP32_Keypad ({mac})!")

            buffer_data = ""
            while should_run:
                ready_to_read, _, _ = select.select([sock], [], [], 0.5)
                if ready_to_read:
                    chunk = sock.recv(1024)
                    if not chunk:
                        log("warn", "Bluetooth socket closed by peer.")
                        break
                    buffer_data += chunk.decode("utf-8", errors="replace")
                    while "\n" in buffer_data:
                        line, buffer_data = buffer_data.split("\n", 1)
                        parse_and_dispatch_key(line)
        except Exception as e:
            # Connection failed or dropped
            pass
        finally:
            if sock:
                try:
                    sock.close()
                except Exception:
                    pass
            bt_active_socket = None
            update_and_emit_status("disconnected", connected=False)

        if should_run:
            log("info", "ESP32 disconnected. Waiting to reconnect...")
            time.sleep(2.5)


def execute_shortcut(shortcut_id, keys):
    """
    Simulate key presses using pynput.
    keys is an array of strings e.g. ["ctrl", "c"] or ["alt", "tab"]
    """
    global keyboard_controller
    if not keyboard_controller:
        try:
            from pynput.keyboard import Controller
            keyboard_controller = Controller()
        except Exception as e:
            emit_json({
                "type": "shortcut_result",
                "id": shortcut_id,
                "success": False,
                "error": f"pynput keyboard controller not available: {e}"
            })
            return

    from pynput.keyboard import Key, KeyCode

    MODIFIER_MAP = {
        "ctrl": Key.ctrl,
        "control": Key.ctrl,
        "shift": Key.shift,
        "alt": Key.alt,
        "option": Key.alt,
        "super": Key.cmd,
        "cmd": Key.cmd,
        "meta": Key.cmd,
        "win": Key.cmd,
        "tab": Key.tab,
        "enter": Key.enter,
        "return": Key.enter,
        "esc": Key.esc,
        "escape": Key.esc,
        "backspace": Key.backspace,
        "delete": Key.delete,
        "space": Key.space,
        "up": Key.up,
        "down": Key.down,
        "left": Key.left,
        "right": Key.right,
        "home": Key.home,
        "end": Key.end,
        "pageup": Key.page_up,
        "pagedown": Key.page_down,
        "f1": Key.f1, "f2": Key.f2, "f3": Key.f3, "f4": Key.f4,
        "f5": Key.f5, "f6": Key.f6, "f7": Key.f7, "f8": Key.f8,
        "f9": Key.f9, "f10": Key.f10, "f11": Key.f11, "f12": Key.f12,
        "f13": Key.f13, "f14": Key.f14, "f15": Key.f15, "f16": Key.f16,
        "f17": Key.f17, "f18": Key.f18, "f19": Key.f19, "f20": Key.f20,
        "media_volume_up": Key.media_volume_up, "volume_up": Key.media_volume_up, "volup": Key.media_volume_up, "audiovolumeup": Key.media_volume_up,
        "media_volume_down": Key.media_volume_down, "volume_down": Key.media_volume_down, "voldown": Key.media_volume_down, "audiovolumedown": Key.media_volume_down,
        "media_volume_mute": Key.media_volume_mute, "volume_mute": Key.media_volume_mute, "mute": Key.media_volume_mute, "audiovolumemute": Key.media_volume_mute,
        "media_play_pause": Key.media_play_pause, "play_pause": Key.media_play_pause, "playpause": Key.media_play_pause,
        "media_next": Key.media_next, "next_track": Key.media_next, "media_previous": Key.media_previous, "prev_track": Key.media_previous,
        "print_screen": Key.print_screen, "printscreen": Key.print_screen, "prtsc": Key.print_screen,
        "insert": Key.insert,
    }

    resolved_keys = []
    for k in keys:
        norm = str(k).strip().lower()
        if norm in MODIFIER_MAP:
            resolved_keys.append(MODIFIER_MAP[norm])
        elif len(norm) == 1:
            resolved_keys.append(KeyCode.from_char(norm))
        else:
            resolved_keys.append(KeyCode.from_char(norm[0]))

    try:
        # Press all keys in sequence
        for rk in resolved_keys:
            keyboard_controller.press(rk)
        time.sleep(0.05)
        # Release in reverse order
        for rk in reversed(resolved_keys):
            keyboard_controller.release(rk)

        emit_json({
            "type": "shortcut_result",
            "id": shortcut_id,
            "success": True,
            "error": None
        })
    except Exception as e:
        emit_json({
            "type": "shortcut_result",
            "id": shortcut_id,
            "success": False,
            "error": str(e)
        })


def handle_stdin_command(cmd_obj):
    """Process incoming JSON commands from Electron main process."""
    global bt_active_socket, should_run

    cmd = cmd_obj.get("cmd", "")

    if cmd == "clear":
        with state_lock:
            app_state["buffer"] = ""
            app_state["lastKey"] = ""
        if bt_active_socket:
            try:
                bt_active_socket.sendall(b"CLEAR\n")
            except Exception:
                pass
        log("info", "Buffer cleared.")
        emit_json({
            "type": "key",
            "key": "",
            "buffer": "",
            "count": 0,
            "uptime": 0,
            "timestamp": time.time()
        })

    elif cmd == "simulate_key":
        key = str(cmd_obj.get("key", "1"))
        now = time.time()
        with state_lock:
            app_state["lastKey"] = key
            app_state["buffer"] += key
            app_state["count"] += 1
            app_state["last_seen"] = now
            current_buffer = app_state["buffer"]
            current_count = app_state["count"]

        emit_json({
            "type": "key",
            "key": key,
            "buffer": current_buffer,
            "count": current_count,
            "uptime": int(now * 1000) % 1000000,
            "timestamp": now,
            "simulated": True
        })

    elif cmd == "execute_shortcut":
        shortcut_id = cmd_obj.get("id", "req-0")
        keys = cmd_obj.get("keys", [])
        execute_shortcut(shortcut_id, keys)

    elif cmd == "reconnect":
        custom_mac = cmd_obj.get("mac")
        if custom_mac:
            save_cached_mac(custom_mac)
            with state_lock:
                app_state["device_mac"] = custom_mac
        # Force closing active socket to trigger reconnect cycle
        if bt_active_socket:
            try:
                bt_active_socket.close()
            except Exception:
                pass

    elif cmd == "get_status":
        with state_lock:
            emit_json({
                "type": "status",
                "connected": app_state["connected"],
                "state": app_state["state"],
                "mac": app_state["device_mac"],
                "device_name": app_state["device_name"],
                "timestamp": time.time()
            })

    elif cmd == "exit":
        should_run = False
        if bt_active_socket:
            try:
                bt_active_socket.close()
            except Exception:
                pass
        sys.exit(0)


def stdin_reader_loop():
    """Read line-delimited JSON commands from Electron via stdin."""
    while should_run:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            cmd_obj = json.loads(line)
            handle_stdin_command(cmd_obj)
        except Exception as e:
            log("error", f"Error reading stdin command: {e}")


def main():
    log("info", "EVOKE Bluetooth Bridge started.")
    initial_mac = get_cached_mac()
    update_and_emit_status("disconnected", connected=False, mac=initial_mac)

    # Start stdin reader thread
    stdin_thread = threading.Thread(target=stdin_reader_loop, daemon=True)
    stdin_thread.start()

    # Start Bluetooth worker thread
    bt_thread = threading.Thread(target=bluetooth_worker_loop, daemon=True)
    bt_thread.start()

    # Main thread waits until should_run is False
    try:
        while should_run:
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
