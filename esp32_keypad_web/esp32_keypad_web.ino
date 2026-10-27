/*
 * ESP32 4x4 Matrix Keypad Interface with Real-Time Web Display
 * 
 * Hardware:
 *   - ESP32 DevKit V1 (30-pin or 38-pin)
 *   - 4x4 Matrix Membrane / Tactile Keypad
 * 
 * Default Wiring:
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
 * Wi-Fi Access:
 *   - By default, creates an Access Point: "ESP32-Keypad" (no password).
 *   - Connect to it and open: http://192.168.4.1 or http://esp32keypad.local
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include "web_page.h"

// ==========================================
// 1. PIN CONFIGURATION
// ==========================================
const uint8_t ROW_PINS[4] = { 19, 18, 5, 17 };
const uint8_t COL_PINS[4] = { 23, 22, 21, 16 };

// 4x4 Keypad layout
const char KEY_MAP[4][4] = {
  { '1', '2', '3', 'A' },
  { '4', '5', '6', 'B' },
  { '7', '8', '9', 'C' },
  { '*', '0', '#', 'D' }
};

// ==========================================
// 2. WI-FI CONFIGURATION
// ==========================================
// Access Point (AP) mode defaults (plug-and-play without home router)
const char* AP_SSID = "ESP32-Keypad";
const char* AP_PASS = ""; // Leave blank for open network, or set min 8 characters

// Optional: Home / Office Wi-Fi (Station mode)
// If set, ESP32 connects to your local network AND keeps AP active
const char* STA_SSID = ""; // e.g. "MyHomeWiFi"
const char* STA_PASS = ""; // e.g. "MyPassword"

// Web Server on port 80
WebServer server(80);

// ==========================================
// 3. APPLICATION STATE
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

// ==========================================
// 4. MATRIX KEYPAD SCANNER
// ==========================================
char rawScanKeypad() {
  for (int r = 0; r < 4; r++) {
    // Drive the active row LOW
    digitalWrite(ROW_PINS[r], LOW);
    delayMicroseconds(5); // Settle capacitance

    // Check each column
    for (int c = 0; c < 4; c++) {
      if (digitalRead(COL_PINS[c]) == LOW) {
        // Return row to HIGH before returning
        digitalWrite(ROW_PINS[r], HIGH);
        return KEY_MAP[r][c];
      }
    }

    // Return current row to HIGH
    digitalWrite(ROW_PINS[r], HIGH);
  }
  return '\0'; // No key pressed
}

void processKeypad() {
  char keySample = rawScanKeypad();

  // Reset debounce timer if reading changed
  if (keySample != currentReading) {
    currentReading = keySample;
    lastDebounceTime = millis();
  }

  // Once stable reading duration exceeds debounce delay
  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
    // Key state has changed
    if (currentReading != stableKey) {
      stableKey = currentReading;

      // On Key Down (a new key was pressed)
      if (stableKey != '\0') {
        lastKey = stableKey;
        keyCount++;

        // Append to buffer
        if (keyBuffer.length() >= MAX_BUFFER_LEN) {
          keyBuffer = keyBuffer.substring(1); // Drop oldest character
        }
        keyBuffer += stableKey;

        // Print to Serial Monitor
        Serial.printf("[KEYPAD] Key: '%c' | Total: %u | Buffer: %s\n", 
                      lastKey, keyCount, keyBuffer.c_str());
      }
    }
  }
}

// ==========================================
// 5. HTTP REQUEST HANDLERS
// ==========================================
void handleRoot() {
  server.send_P(200, "text/html", INDEX_HTML);
}

void handleApiData() {
  String json = "{";
  json += "\"lastKey\":\"";
  if (lastKey != '\0') {
    json += lastKey;
  }
  json += "\",";
  json += "\"buffer\":\"" + keyBuffer + "\",";
  json += "\"count\":" + String(keyCount) + ",";
  json += "\"uptime\":" + String(millis());
  json += "}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

void handleApiClear() {
  keyBuffer = "";
  lastKey = '\0';
  Serial.println("[KEYPAD] Buffer cleared via web interface");

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", "{\"status\":\"ok\",\"cleared\":true}");
}

void handleNotFound() {
  server.send(404, "text/plain", "404: Not Found");
}

// ==========================================
// 6. SETUP AND MAIN LOOP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n======================================");
  Serial.println("  ESP32 4x4 Keypad Web Interface");
  Serial.println("======================================");

  // Initialize Matrix Rows (OUTPUT, default HIGH)
  for (int r = 0; r < 4; r++) {
    pinMode(ROW_PINS[r], OUTPUT);
    digitalWrite(ROW_PINS[r], HIGH);
  }

  // Initialize Matrix Columns (INPUT with internal PULLUP)
  for (int c = 0; c < 4; c++) {
    pinMode(COL_PINS[c], INPUT_PULLUP);
  }
  Serial.println("[GPIO] Keypad pins initialized successfully.");

  // Configure Wi-Fi
  WiFi.mode(WIFI_AP_STA);

  // 1. Start SoftAP
  bool apSuccess;
  if (strlen(AP_PASS) >= 8) {
    apSuccess = WiFi.softAP(AP_SSID, AP_PASS);
  } else {
    apSuccess = WiFi.softAP(AP_SSID); // Open network
  }

  if (apSuccess) {
    Serial.print("[WIFI AP] Access Point started: ");
    Serial.println(AP_SSID);
    Serial.print("[WIFI AP] Web Address: http://");
    Serial.println(WiFi.softAPIP());
  } else {
    Serial.println("[WIFI AP] Failed to start SoftAP!");
  }

  // 2. Optionally connect to Station Wi-Fi
  if (strlen(STA_SSID) > 0) {
    Serial.print("[WIFI STA] Connecting to ");
    Serial.println(STA_SSID);
    WiFi.begin(STA_SSID, STA_PASS);

    unsigned long startAttemptTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 8000) {
      delay(300);
      Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("[WIFI STA] Connected! IP Address: http://");
      Serial.println(WiFi.localIP());
    } else {
      Serial.println("[WIFI STA] Station connection timeout. AP is still active.");
    }
  }

  // Initialize mDNS responder (http://esp32keypad.local)
  if (MDNS.begin("esp32keypad")) {
    Serial.println("[mDNS] Responder started: http://esp32keypad.local");
    MDNS.addService("http", "tcp", 80);
  }

  // Register Web Server Routes
  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/data", HTTP_GET, handleApiData);
  server.on("/api/clear", HTTP_POST, handleApiClear);
  server.on("/api/clear", HTTP_GET, handleApiClear);
  server.onNotFound(handleNotFound);

  server.begin();
  Serial.println("[HTTP] Web server started on port 80.");
  Serial.println("System ready. Press any key on the keypad!\n");
}

void loop() {
  // Handle incoming HTTP client requests
  server.handleClient();

  // Scan keypad with debouncing
  processKeypad();
}
