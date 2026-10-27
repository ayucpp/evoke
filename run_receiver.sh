#!/usr/bin/env bash
#
# Helper script to launch the ESP32 Bluetooth Keypad Receiver
#

set -e
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================================="
echo " Starting ESP32 Bluetooth Keypad Receiver on Laptop"
echo "=========================================================="

# 1. Check and unblock Bluetooth if soft-blocked
if rfkill list bluetooth | grep -qi "Soft blocked: yes"; then
    echo "[!] Unblocking Bluetooth adapter..."
    sudo rfkill unblock bluetooth || rfkill unblock bluetooth 2>/dev/null || true
fi

# 2. Check if background mode requested
if [[ "$1" == "--bg" || "$1" == "-d" ]]; then
    echo "[+] Launching receiver in background..."
    nohup python3 "$PROJECT_DIR/bt_keypad_receiver.py" "${@:2}" > "$PROJECT_DIR/bt_receiver.log" 2>&1 &
    PID=$!
    echo "[✓] Receiver started in background with PID: $PID"
    echo "[✓] Web dashboard: http://localhost:5000"
    echo "[✓] Log file: $PROJECT_DIR/bt_receiver.log"
    echo "To stop: kill $PID"
else
    # Foreground mode
    python3 "$PROJECT_DIR/bt_keypad_receiver.py" "$@"
fi
