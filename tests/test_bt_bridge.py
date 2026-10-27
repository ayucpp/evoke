#!/usr/bin/env python3
"""
Unit tests for EVOKE Bluetooth Bridge protocol and helper functions.
"""

import sys
import os
import json
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import bt_bridge

print("=== Running Bluetooth Bridge Tests ===")

# 1. Test cached MAC resolution
mac = bt_bridge.get_cached_mac()
assert mac == "28:05:A5:E2:18:96", f"Expected cached MAC '28:05:A5:E2:18:96', got {mac}"
print("✔ Cached MAC address retrieved from .esp32_mac")

# 2. Test JSON parsing of ESP32 key events
captured_events = []
original_emit = bt_bridge.emit_json

def mock_emit(payload):
    captured_events.append(payload)

bt_bridge.emit_json = mock_emit

raw_packet = '{"key":"1","buffer":"1","count":1,"uptime":1024}'
bt_bridge.parse_and_dispatch_key(raw_packet)

assert len(captured_events) == 1, "Should emit one event"
event = captured_events[0]
assert event["type"] == "key"
assert event["key"] == "1"
assert event["buffer"] == "1"
assert event["count"] == 1
print("✔ ESP32 Bluetooth JSON telemetry parsed and dispatched")

# 3. Test raw character fallback parsing
captured_events.clear()
bt_bridge.parse_and_dispatch_key("B")
assert len(captured_events) == 1
assert captured_events[0]["key"] == "B"
assert captured_events[0]["type"] == "key"
print("✔ Raw single-character packet fallback parsing")

# 4. Test simulate_key command
captured_events.clear()
bt_bridge.handle_stdin_command({"cmd": "simulate_key", "key": "9"})
assert len(captured_events) == 1
assert captured_events[0]["key"] == "9"
assert captured_events[0].get("simulated") is True
print("✔ Key simulation command handling for hardware-less testing")

# 5. Test clear buffer command
captured_events.clear()
bt_bridge.handle_stdin_command({"cmd": "clear"})
assert any(e.get("type") == "key" and e.get("buffer") == "" for e in captured_events)
print("✔ Buffer clear command handling")

# 6. Test shortcut key execution controller availability
captured_events.clear()
bt_bridge.handle_stdin_command({"cmd": "execute_shortcut", "id": "test-req-1", "keys": ["ctrl", "c"]})
assert len(captured_events) >= 1
shortcut_res = [e for e in captured_events if e.get("type") == "shortcut_result"][0]
assert shortcut_res["id"] == "test-req-1"
# In test environment, it should either succeed or cleanly report display/permission status without crashing
assert "success" in shortcut_res
print("✔ pynput keyboard shortcut command interface and response handling")

print("\nAll Bluetooth Bridge tests passed successfully! [6/6]\n")
