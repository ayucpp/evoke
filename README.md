# ESP32 4x4 Matrix Keypad & EVOKE Desktop Companion

This repository contains the complete ecosystem for a programmable **ESP32 4x4 matrix keypad** and its desktop companion application, **EVOKE**.

1. **EVOKE Desktop Companion (Electron + Python backend)**: Visual configuration and control center for the 16 physical keys. Lets users assign application launches, keyboard shortcuts (via `pynput`), multi-step macros, and Python scripts with zero firmware modifications.
2. **Bluetooth Classic (SPP) Receiver**: Auto-connecting background RFCOMM receiver and hardware integration bridge.
3. **Wi-Fi Mode**: Embedded standalone web server (`http://192.168.4.1`) hosted directly on the ESP32.

---

## 1. Hardware Overview & Wiring

### Components Required
- 1x ESP32 DevKit Board (30-pin or 38-pin NodeMCU / ESP32-WROOM-32)
- 1x 4x4 Matrix Keypad (16 keys: `0-9`, `A-D`, `*`, `#`)
- 8x Female-to-Male or Female-to-Female Jumper Wires
- 1x Micro-USB or USB-C cable for programming & power

### 4x4 Keypad Layout
```text
  [ 1 ]  [ 2 ]  [ 3 ]  [ A ]   <-- Row 1 (R1)
  [ 4 ]  [ 5 ]  [ 6 ]  [ B ]   <-- Row 2 (R2)
  [ 7 ]  [ 8 ]  [ 9 ]  [ C ]   <-- Row 3 (R3)
  [ * ]  [ 0 ]  [ # ]  [ D ]   <-- Row 4 (R4)
    ^      ^      ^      ^
   Col 1  Col 2  Col 3  Col 4
   (C1)   (C2)   (C3)   (C4)
```

### Pin Connection Table

| Keypad Pin | Description | ESP32 GPIO | Suggested Wire Color |
| :--- | :--- | :--- | :--- |
| **Pin 1** (Leftmost) | **Row 1 (R1)** | **GPIO 19** | Red |
| **Pin 2** | **Row 2 (R2)** | **GPIO 18** | Orange |
| **Pin 3** | **Row 3 (R3)** | **GPIO 5**  | Yellow |
| **Pin 4** | **Row 4 (R4)** | **GPIO 17** | Green |
| **Pin 5** | **Col 1 (C1)** | **GPIO 23** | Blue |
| **Pin 6** | **Col 2 (C2)** | **GPIO 22** | Cyan |
| **Pin 7** | **Col 3 (C3)** | **GPIO 21** | Purple |
| **Pin 8** (Rightmost) | **Col 4 (C4)** | **GPIO 16** | Pink |

> **Note**: Pin 1 is typically on the far left when looking at the front of the keypad with the ribbon pointing down. Column pins use the ESP32's internal pull-up resistors (`INPUT_PULLUP`), so no external resistors are needed.

---

## 2. Project File Structure

```text
mc-project/
├── esp32_keypad_bt/
│   └── esp32_keypad_bt.ino      # ESP32 Bluetooth Classic (SPP) firmware
├── esp32_keypad_web/
│   ├── esp32_keypad_web.ino     # ESP32 Wi-Fi standalone firmware
│   └── web_page.h               # HTML5/CSS3/JS UI in PROGMEM
├── bt_keypad_receiver.py        # Laptop Python auto-connect daemon & web server
├── run_receiver.sh              # One-click launch script for laptop
├── diagram.json                 # Wokwi simulation circuit layout
├── wokwi.toml                   # Wokwi project configuration
└── README.md                    # Documentation & setup guide
```

---

## 3. Bluetooth Mode (ESP32 to Laptop)

### Step 1: Flash the ESP32 with Bluetooth Firmware
1. Open [`esp32_keypad_bt/esp32_keypad_bt.ino`](file:///home/ayush/Ayush/mc-project/esp32_keypad_bt/esp32_keypad_bt.ino) in Arduino IDE.
2. Select your board (**Tools** > **Board** > **esp32** > **ESP32 Dev Module**) and COM port.
3. Click **Upload**.
4. The ESP32 will start advertising over Bluetooth with device name: **`ESP32_Keypad`**.

### Step 2: Run the Background Receiver on your Laptop
Ensure your laptop Bluetooth is unblocked:
```bash
sudo rfkill unblock bluetooth
```

Run the receiver script:
```bash
./run_receiver.sh
```
*(Or run in the background as a daemon: `./run_receiver.sh --bg`)*

#### What the Laptop Script Does:
- **Automatic Background Discovery**: Automatically searches for `ESP32_Keypad` and pairs/connects over RFCOMM.
- **Auto-Reconnect**: If the ESP32 is powered off or rebooted, the script silently waits and reconnects the instant the ESP32 turns back on.
- **Terminal Display**: Prints incoming keystrokes and sequence buffer in your terminal.
- **Live Browser Dashboard**: Hosts a local web server at:
  ```text
  http://localhost:5000
  ```
  Open this in any browser on your laptop to see the active key, the sequence buffer, the virtual 4x4 matrix mirror, and keystroke history with audio feedback!

---

## 4. Wi-Fi Mode (Standalone Embedded Web Server)

If you prefer direct Wi-Fi without Bluetooth:
1. Open [`esp32_keypad_web/esp32_keypad_web.ino`](file:///home/ayush/Ayush/mc-project/esp32_keypad_web/esp32_keypad_web.ino) in Arduino IDE and upload.
2. Connect your laptop or phone Wi-Fi to the network:
   - **SSID**: `ESP32-Keypad` (Open network, no password)
3. Open your browser and go to:
   ```text
   http://192.168.4.1
   ```

---

## 5. Web Dashboard Features

- **Active Key Hero Badge**: Shows the currently pressed key with scale and glow animations.
- **Display Buffer**: Accumulates typed numbers and characters in a terminal-style display box.
- **Live 4x4 Matrix Mirror**: An interactive virtual keypad that lights up the exact button corresponding to your physical keypress.
- **Recent Keystrokes Log**: Keeps a running log of the last 20 keystrokes with timestamps.
- **Tactile Audio Feedback**: Synthesized beep tone using the Web Audio API on keypress (toggleable).
- **Clear & Copy Controls**:
  - `Clear Screen`: Clears the display buffer on both laptop and ESP32.
  - `Copy`: Copies the sequence to your device clipboard.

---

## 6. Testing via Wokwi Online Simulator

You can test the circuit in simulation before wiring hardware:
1. Visit [Wokwi.com](https://wokwi.com) and start a new **ESP32** project.
2. Paste the contents of [`diagram.json`](file:///home/ayush/Ayush/mc-project/diagram.json) into the diagram tab.
3. Paste `esp32_keypad_web.ino` and `web_page.h` into the code tab.
4. Click **Play / Start Simulation**.
5. Click buttons on the simulated 4x4 keypad to verify matrix scanning.

---

## 7. Troubleshooting

- **Bluetooth connection fails or times out**:
  - Check if Bluetooth is soft-blocked: run `sudo rfkill unblock bluetooth`.
  - Ensure the ESP32 has finished booting and is advertising as `ESP32_Keypad`.
  - Pass the MAC address explicitly if you already know it: `python3 bt_keypad_receiver.py --mac 34:85:18:XX:XX:XX`.
- **Keys show wrong characters**:
  - Check the orientation of the 8-pin keypad ribbon connector against the pin table.
- **Key presses repeat or bounce**:
  - Adjust `DEBOUNCE_DELAY_MS` in the sketch from `25` to `35-40` ms.

---

## 8. EVOKE Desktop Companion

**EVOKE** is the Electron-based desktop application that turns your 4×4 keypad into an interactive macro pad, application launcher, and automation center.

### Exact Visual Identity & Palette
- **Near Black** (`#0B0C0D`): Dark backgrounds & primary surfaces
- **Deep Green** (`#243A2C`): Secondary surfaces, navigation, selected key states
- **Muted Green** (`#6FA67A`): Primary accent, action buttons, active indicators
- **Pale Green** (`#C9E7C0`): Highlights, subtle badges, and text accents
- **Off-White** (`#FBFCF8`): Light theme background and crisp typography

### Key Action Types Supported
1. **Launch Application**: Specify an executable path or terminal command with optional arguments.
2. **Keyboard Shortcut**: Press `Record Shortcut` or pick a preset (`Ctrl+C`, `Ctrl+V`, `Alt+Tab`, `Super+L`, etc.). Executed via `pynput` on Linux X11 sessions.
3. **Macro**: Build an ordered sequence of actions (App launches, Key combinations, and configurable Delays).
4. **Python Script**: Run any local `.py` script with arguments, non-blocking asynchronous execution, stdout capture, and 15-second timeout protection.
5. **No Action**: Leaves key unassigned for pure buffer typing.

### Running EVOKE

Ensure Node.js and dependencies are installed:
```bash
# Start EVOKE Desktop App
npm start
```

### Running Automated Test Suite
```bash
# Run unit tests covering keymap store, action executor, and Bluetooth bridge
npm test
```

### Architecture & Security
- **Electron Renderer**: 4×4 visual interactive matrix grid, key configuration drawer, macro builder, live telemetry stream.
- **Electron Main**: Window lifecycle, action executor (`child_process`), keymap storage service (`config/keymap.json`).
- **Preload Script**: Isolated `contextBridge` (`window.evoke`) with strict schema validation; `nodeIntegration: false`, `contextIsolation: true`.
- **Backend Bridge**: `backend/bt_bridge.py` auto-connects to `ESP32_Keypad` via Bluetooth Classic RFCOMM and relays JSON telemetry to Electron via stdio.

