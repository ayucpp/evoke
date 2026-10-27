/*
 * ESP32 4x4 Matrix Keypad Interface with Bluetooth Serial (SPP)
 * 
 * Hardware:
 *   - ESP32 DevKit V1 (30-pin or 38-pin)
 *   - 4x4 Matrix Membrane / Tactile Keypad
 * 
 * Pin Connections:
 *   Keypad Pin | Description | ESP32 GPIO
 *   -----------+-------------+-----------
 *   Pin 1 (R1) | Row 1       | GPIO 19
 *   Pin 2 (R2) | Row 2       | GPIO 18
 *   Pin 3 (R3) | Row 3       | GPIO 5
 *   Pin 4 (R4) | Row 4       | GPIO 17
 *   Pin 5 (C1) | Column 1    | GPIO 23
 *   Pin 6 (C2) | Column 2    | GPIO 22
 *   Pin 7 (C3) | Column 3    | GPIO 21
 *   Pin 8 (C4) | Column 4    | GPIO 16
 * 
 * Bluetooth Profile:
 *   - Classic Bluetooth SPP (Serial Port Profile)
 *   - Device Name: "ESP32_Keypad"
 *   - Automatically transmits JSON formatted events on keypress.
 *   - Accepts "CLEAR\n" command from laptop to reset buffer.
 */

#include "BluetoothSerial.h"

#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
#error "Bluetooth is not enabled in your ESP32 Arduino Core! Select an ESP32 board in Tools > Board."
#endif

BluetoothSerial SerialBT;

// ==========================================
// 1. PIN CONFIGURATION
// ==========================================
const uint8_t ROW_PINS[4] = { 19, 18, 5, 17 };
const uint8_t COL_PINS[4] = { 23, 22, 21, 16 };

const char KEY_MAP[4][4] = {
  { '1', '2', '3', 'A' },
  { '4', '5', '6', 'B' },
  { '7', '8', '9', 'C' },
  { '*', '0', '#', 'D' }
};

// ==========================================
// 2. APPLICATION STATE
// ==========================================
char lastKey = '\0';
String keyBuffer = "";
const size_t MAX_BUFFER_LEN = 64;
uint32_t keyCount = 0;

// Debouncing state
char currentReading = '\0';
char stableKey = '\0';
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY_MS = 25;

// Connection tracking
bool clientConnected = false;

void btCallback(esp_spp_cb_event_t event, esp_spp_cb_param_t *param) {
  if (event == ESP_SPP_SRV_OPEN_EVT) {
    clientConnected = true;
    Serial.println("\n[BLUETOOTH] >>> Laptop connected via Bluetooth! <<<");
  } else if (event == ESP_SPP_CLOSE_EVT) {
    clientConnected = false;
    Serial.println("\n[BLUETOOTH] >>> Laptop disconnected. Waiting for reconnection... <<<");
  }
}

// ==========================================
// 3. MATRIX KEYPAD SCANNER
// ==========================================
char rawScanKeypad() {
  for (int r = 0; r < 4; r++) {
    digitalWrite(ROW_PINS[r], LOW);
    delayMicroseconds(5);

    for (int c = 0; c < 4; c++) {
      if (digitalRead(COL_PINS[c]) == LOW) {
        digitalWrite(ROW_PINS[r], HIGH);
        return KEY_MAP[r][c];
      }
    }
    digitalWrite(ROW_PINS[r], HIGH);
  }
  return '\0';
}

void processKeypad() {
  char keySample = rawScanKeypad();

  if (keySample != currentReading) {
    currentReading = keySample;
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
    if (currentReading != stableKey) {
      stableKey = currentReading;

      // On Key Down (new key pressed)
      if (stableKey != '\0') {
        lastKey = stableKey;
        keyCount++;

        if (keyBuffer.length() >= MAX_BUFFER_LEN) {
          keyBuffer = keyBuffer.substring(1);
        }
        keyBuffer += stableKey;

        // Print to USB Serial
        Serial.printf("[KEYPAD] Key: '%c' | Total: %u | Buffer: %s\n", 
                      lastKey, keyCount, keyBuffer.c_str());

        // Transmit JSON packet over Bluetooth Serial
        String btMsg = "{\"key\":\"";
        btMsg += lastKey;
        btMsg += "\",\"buffer\":\"" + keyBuffer + "\",";
        btMsg += "\"count\":" + String(keyCount) + ",";
        btMsg += "\"uptime\":" + String(millis()) + "}\n";

        SerialBT.print(btMsg);
      }
    }
  }
}

// ==========================================
// 4. SETUP AND MAIN LOOP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==========================================");
  Serial.println("  ESP32 4x4 Keypad - Bluetooth Interface");
  Serial.println("==========================================");

  // Initialize Matrix Rows (OUTPUT, default HIGH)
  for (int r = 0; r < 4; r++) {
    pinMode(ROW_PINS[r], OUTPUT);
    digitalWrite(ROW_PINS[r], HIGH);
  }

  // Initialize Matrix Columns (INPUT with internal PULLUP)
  for (int c = 0; c < 4; c++) {
    pinMode(COL_PINS[c], INPUT_PULLUP);
  }
  Serial.println("[GPIO] Keypad pins initialized.");

  // Register Bluetooth callback to monitor connect/disconnect events
  SerialBT.register_callback(btCallback);

  // Start Bluetooth Serial as "ESP32_Keypad"
  if (SerialBT.begin("ESP32_Keypad")) {
    Serial.println("[BLUETOOTH] Bluetooth Serial started successfully!");
    Serial.println("[BLUETOOTH] Device Name: \"ESP32_Keypad\"");
    Serial.println("[BLUETOOTH] Ready! Waiting for laptop background script to connect...");
  } else {
    Serial.println("[BLUETOOTH] ERROR: Failed to initialize Bluetooth Serial!");
  }
}

void loop() {
  // Listen for commands from the laptop over Bluetooth
  if (SerialBT.available()) {
    String cmd = SerialBT.readStringUntil('\n');
    cmd.trim();
    if (cmd.equalsIgnoreCase("CLEAR")) {
      keyBuffer = "";
      lastKey = '\0';
      Serial.println("[BLUETOOTH] Buffer reset requested by laptop.");
      SerialBT.println("{\"status\":\"cleared\",\"buffer\":\"\",\"count\":0}");
    }
  }

  // Scan keypad with debouncing
  processKeypad();
}
