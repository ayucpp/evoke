#ifndef WEB_PAGE_H
#define WEB_PAGE_H

#include <Arduino.h>

const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESP32 4x4 Keypad Monitor</title>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-card: #1e293b;
      --bg-card-hover: #334155;
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.35);
      --key-active: #f59e0b;
      --key-active-glow: rgba(245, 158, 11, 0.45);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --border: #334155;
      --success: #10b981;
      --danger: #ef4444;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.5rem 1rem;
    }

    .container {
      width: 100%;
      max-width: 860px;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }

    .header-title h1 {
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      color: var(--text-primary);
    }

    .header-title p {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      background: var(--bg-card);
      border: 1px solid var(--border);
    }

    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background-color: var(--success);
      box-shadow: 0 0 8px var(--success);
    }

    .status-dot.offline {
      background-color: var(--danger);
      box-shadow: 0 0 8px var(--danger);
    }

    /* Main Grid Layout */
    .grid-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }

    @media (max-width: 720px) {
      .grid-layout {
        grid-template-columns: 1fr;
      }
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }

    .card-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Primary Key Hero Display */
    .hero-display {
      text-align: center;
      padding: 1rem 0;
    }

    .key-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100px;
      height: 100px;
      border-radius: 1.25rem;
      background: linear-gradient(145deg, #1e293b, #0f172a);
      border: 2px solid var(--accent);
      box-shadow: 0 0 25px var(--accent-glow);
      font-size: 3.5rem;
      font-weight: 800;
      color: var(--accent);
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
    }

    .key-badge.pressed {
      transform: scale(1.12);
      border-color: var(--key-active);
      color: var(--key-active);
      box-shadow: 0 0 35px var(--key-active-glow);
    }

    /* Screen / Buffer Display */
    .buffer-box {
      background: #090d16;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      padding: 1rem;
      min-height: 75px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      overflow-x: auto;
      font-family: "Courier New", Courier, monospace;
      font-size: 1.85rem;
      letter-spacing: 0.18em;
      color: #38bdf8;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);
      word-break: break-all;
    }

    .buffer-placeholder {
      color: #475569;
      font-size: 1.1rem;
      letter-spacing: normal;
      font-style: italic;
    }

    .btn-group {
      display: flex;
      gap: 0.5rem;
    }

    button {
      flex: 1;
      padding: 0.65rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border);
      background: var(--bg-card-hover);
      color: var(--text-primary);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
    }

    button:hover {
      background: #475569;
      border-color: #64748b;
    }

    button.btn-danger {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: #fca5a5;
    }

    button.btn-danger:hover {
      background: rgba(239, 68, 68, 0.3);
      border-color: #ef4444;
    }

    /* Virtual Keypad Mirror */
    .keypad-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.6rem;
      max-width: 320px;
      margin: 0 auto;
    }

    .v-key {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.35rem;
      font-weight: 700;
      border-radius: 0.75rem;
      background: #0f172a;
      border: 1px solid #334155;
      color: #e2e8f0;
      transition: all 0.1s ease;
      user-select: none;
    }

    .v-key.letter {
      color: #f59e0b;
      border-color: rgba(245, 158, 11, 0.3);
    }

    .v-key.symbol {
      color: #38bdf8;
      border-color: rgba(56, 189, 248, 0.3);
    }

    .v-key.active {
      background: var(--accent);
      color: #0f172a;
      border-color: var(--accent);
      box-shadow: 0 0 16px var(--accent-glow);
      transform: translateY(-2px) scale(0.96);
    }

    /* History table */
    .history-card {
      grid-column: 1 / -1;
    }

    .history-container {
      max-height: 180px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      text-align: left;
    }

    th, td {
      padding: 0.6rem 0.85rem;
      border-bottom: 1px solid #1e293b;
    }

    th {
      background: #0f172a;
      color: var(--text-secondary);
      font-weight: 600;
      position: sticky;
      top: 0;
    }

    tr:nth-child(even) {
      background: rgba(255, 255, 255, 0.02);
    }

    .badge-cell {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 0.25rem;
      background: #334155;
      font-weight: bold;
      color: #38bdf8;
    }

    /* Controls footer */
    .controls-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .toggle-label {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      cursor: pointer;
      user-select: none;
    }

    footer {
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title">
        <h1>ESP32 4x4 Keypad Monitor</h1>
        <p>Live Matrix Keypad Telemetry & Buffer Stream</p>
      </div>
      <div class="status-badge">
        <span class="status-dot" id="statusDot"></span>
        <span id="statusText">Connected</span>
      </div>
    </header>

    <div class="grid-layout">
      <!-- Left Column: Display and Sequence Buffer -->
      <div class="card">
        <div class="card-title">
          <span>Active Key</span>
          <span style="font-size: 0.8rem; text-transform: none; color: var(--text-secondary);" id="counterLabel">Total: 0</span>
        </div>

        <div class="hero-display">
          <div class="key-badge" id="keyBadge">-</div>
        </div>

        <div class="card-title" style="margin-top: 0.5rem;">
          <span>Display Buffer</span>
        </div>
        <div class="buffer-box" id="bufferBox">
          <span class="buffer-placeholder">Waiting for keypress...</span>
        </div>

        <div class="btn-group">
          <button class="btn-danger" id="btnClear">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
            Clear Screen
          </button>
          <button id="btnCopy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy
          </button>
        </div>

        <div class="controls-row">
          <label class="toggle-label">
            <input type="checkbox" id="chkAudio" checked>
            <span>Key Beep Sound</span>
          </label>
          <span id="rateLabel">Polling: 10 Hz</span>
        </div>
      </div>

      <!-- Right Column: Interactive 4x4 Keypad Matrix Mirror -->
      <div class="card">
        <div class="card-title">
          <span>4x4 Matrix Mirror</span>
          <span style="font-size: 0.75rem; text-transform: none;">Visual Feedback</span>
        </div>
        <div class="keypad-grid" id="keypadGrid">
          <!-- Row 1 -->
          <div class="v-key" data-key="1">1</div>
          <div class="v-key" data-key="2">2</div>
          <div class="v-key" data-key="3">3</div>
          <div class="v-key letter" data-key="A">A</div>
          <!-- Row 2 -->
          <div class="v-key" data-key="4">4</div>
          <div class="v-key" data-key="5">5</div>
          <div class="v-key" data-key="6">6</div>
          <div class="v-key letter" data-key="B">B</div>
          <!-- Row 3 -->
          <div class="v-key" data-key="7">7</div>
          <div class="v-key" data-key="8">8</div>
          <div class="v-key" data-key="9">9</div>
          <div class="v-key letter" data-key="C">C</div>
          <!-- Row 4 -->
          <div class="v-key symbol" data-key="*">*</div>
          <div class="v-key" data-key="0">0</div>
          <div class="v-key symbol" data-key="#">#</div>
          <div class="v-key letter" data-key="D">D</div>
        </div>
      </div>

      <!-- Bottom Row: Recent Keystrokes Log -->
      <div class="card history-card">
        <div class="card-title">
          <span>Keystroke Log</span>
          <span style="font-size: 0.75rem; text-transform: none; color: var(--text-secondary);">Last 20 Events</span>
        </div>
        <div class="history-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Key</th>
                <th>Time (ESP32 Uptime)</th>
                <th>Event</th>
              </tr>
            </thead>
            <tbody id="historyBody">
              <tr>
                <td colspan="4" style="text-align: center; color: var(--text-secondary);">No keystrokes recorded yet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <footer>
      ESP32 Embedded Web Server &bull; 4x4 Matrix Keypad Interface
    </footer>
  </div>

  <script>
    // Web Audio Synthesizer for tactile feedback
    let audioCtx = null;
    function playBeep(freq = 880, duration = 0.04) {
      if (!document.getElementById('chkAudio').checked) return;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch (e) {
        console.warn("Audio error:", e);
      }
    }

    // State Variables
    let lastKeyCount = -1;
    let failCount = 0;
    const historyList = [];
    const maxHistory = 20;

    // DOM Elements
    const keyBadge = document.getElementById('keyBadge');
    const bufferBox = document.getElementById('bufferBox');
    const counterLabel = document.getElementById('counterLabel');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const historyBody = document.getElementById('historyBody');
    const btnClear = document.getElementById('btnClear');
    const btnCopy = document.getElementById('btnCopy');
    const keyElements = {};

    document.querySelectorAll('.v-key').forEach(el => {
      keyElements[el.getAttribute('data-key')] = el;
    });

    // Highlight key on the virtual keypad
    function triggerVirtualKey(key) {
      const el = keyElements[key];
      if (el) {
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 250);
      }
    }

    // Format uptime into readable seconds/ms
    function formatTime(ms) {
      const totalSec = (ms / 1000).toFixed(2);
      return `${totalSec}s`;
    }

    // Fetch live data from ESP32
    async function pollKeypad() {
      try {
        const response = await fetch('/api/data', { cache: 'no-store' });
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();

        // Successful connection
        failCount = 0;
        statusDot.classList.remove('offline');
        statusText.textContent = 'Connected';

        // Check if new keypress detected
        if (data.count !== lastKeyCount) {
          if (lastKeyCount !== -1 && data.lastKey && data.lastKey !== '') {
            // Trigger audio & visual animation
            playBeep(data.lastKey >= 'A' ? 1046.5 : 880, 0.05);
            triggerVirtualKey(data.lastKey);

            keyBadge.classList.add('pressed');
            setTimeout(() => keyBadge.classList.remove('pressed'), 200);

            // Add to history
            historyList.unshift({
              num: data.count,
              key: data.lastKey,
              time: formatTime(data.uptime)
            });
            if (historyList.length > maxHistory) historyList.pop();
            renderHistory();
          }

          lastKeyCount = data.count;
          keyBadge.textContent = data.lastKey || '-';
          counterLabel.textContent = `Total: ${data.count}`;

          if (data.buffer && data.buffer.length > 0) {
            bufferBox.textContent = data.buffer;
          } else {
            bufferBox.innerHTML = '<span class="buffer-placeholder">Waiting for keypress...</span>';
          }
        }
      } catch (err) {
        failCount++;
        if (failCount > 3) {
          statusDot.classList.add('offline');
          statusText.textContent = 'Disconnected';
        }
      }
    }

    function renderHistory() {
      if (historyList.length === 0) {
        historyBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No keystrokes recorded yet</td></tr>';
        return;
      }
      historyBody.innerHTML = historyList.map(item => `
        <tr>
          <td>${item.num}</td>
          <td><span class="badge-cell">${item.key}</span></td>
          <td>${item.time}</td>
          <td style="color: var(--success);">&#x25CF; Press</td>
        </tr>
      `).join('');
    }

    // Clear Buffer button handler
    btnClear.addEventListener('click', async () => {
      try {
        await fetch('/api/clear', { method: 'POST' });
        bufferBox.innerHTML = '<span class="buffer-placeholder">Waiting for keypress...</span>';
        keyBadge.textContent = '-';
      } catch (e) {
        console.error('Clear failed', e);
      }
    });

    // Copy to Clipboard button handler
    btnCopy.addEventListener('click', () => {
      const text = bufferBox.textContent;
      if (text && !text.includes('Waiting')) {
        navigator.clipboard.writeText(text).then(() => {
          const original = btnCopy.innerHTML;
          btnCopy.innerHTML = '&#10003; Copied!';
          setTimeout(() => btnCopy.innerHTML = original, 1200);
        });
      }
    });

    // Start 100ms polling loop
    setInterval(pollKeypad, 100);
    pollKeypad();
  </script>
</body>
</html>
)rawliteral";

#endif // WEB_PAGE_H
