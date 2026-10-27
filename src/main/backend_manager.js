const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const EventEmitter = require('events');

class BackendManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.pythonPath = options.pythonPath || this.findPythonBinary();
    this.scriptPath = path.resolve(__dirname, '../../backend/bt_bridge.py');
    this.child = null;
    this.readline = null;
    this.status = {
      connected: false,
      state: 'disconnected',
      mac: null,
      device_name: 'ESP32_Keypad',
      timestamp: Date.now()
    };
    this.pendingShortcuts = new Map();
    this.reqCounter = 0;
    this.shouldRestart = true;
    this.restartTimeout = null;
  }

  findPythonBinary() {
    const venvPython = path.resolve(__dirname, '../../.venv/bin/python3');
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }
    return 'python3';
  }

  start() {
    if (this.child) return;

    this.shouldRestart = true;
    const pythonBin = this.pythonPath;

    try {
      this.child = spawn(pythonBin, [this.scriptPath], {
        cwd: path.resolve(__dirname, '../..'),
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.readline = readline.createInterface({
        input: this.child.stdout,
        terminal: false
      });

      this.readline.on('line', (line) => {
        this.handleBridgeLine(line);
      });

      this.child.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          this.emit('log', { level: 'warn', message: text, timestamp: Date.now() });
        }
      });

      this.child.on('error', (err) => {
        this.emit('log', { level: 'error', message: `Bridge process error: ${err.message}`, timestamp: Date.now() });
      });

      this.child.on('close', (code, signal) => {
        this.child = null;
        this.status.connected = false;
        this.status.state = 'disconnected';
        this.emit('status', this.status);

        if (this.shouldRestart) {
          this.emit('log', { level: 'info', message: `Bridge exited with code ${code}. Restarting in 3s...`, timestamp: Date.now() });
          this.restartTimeout = setTimeout(() => this.start(), 3000);
        }
      });

      this.emit('log', { level: 'info', message: 'Bluetooth bridge started.', timestamp: Date.now() });
    } catch (err) {
      this.emit('log', { level: 'error', message: `Failed to spawn bridge: ${err.message}`, timestamp: Date.now() });
    }
  }

  handleBridgeLine(line) {
    line = line.trim();
    if (!line) return;

    try {
      const msg = JSON.parse(line);
      switch (msg.type) {
        case 'status':
          this.status = {
            connected: !!msg.connected,
            state: msg.state || 'disconnected',
            mac: msg.mac || null,
            device_name: msg.device_name || 'ESP32_Keypad',
            timestamp: msg.timestamp || Date.now()
          };
          this.emit('status', this.status);
          break;

        case 'key':
          this.emit('key', msg);
          break;

        case 'log':
          this.emit('log', msg);
          break;

        case 'shortcut_result':
          if (msg.id && this.pendingShortcuts.has(msg.id)) {
            const { resolve, timer } = this.pendingShortcuts.get(msg.id);
            clearTimeout(timer);
            this.pendingShortcuts.delete(msg.id);
            resolve(msg);
          }
          break;

        default:
          this.emit('message', msg);
          break;
      }
    } catch (err) {
      // Non-JSON line from bridge
      this.emit('log', { level: 'info', message: line, timestamp: Date.now() });
    }
  }

  sendCommand(obj) {
    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
      return false;
    }
    try {
      this.child.stdin.write(JSON.stringify(obj) + '\n');
      return true;
    } catch (err) {
      return false;
    }
  }

  sendShortcut(keys, timeoutMs = 3000) {
    return new Promise((resolve) => {
      const id = `req-${++this.reqCounter}-${Date.now()}`;
      const timer = setTimeout(() => {
        if (this.pendingShortcuts.has(id)) {
          this.pendingShortcuts.delete(id);
          resolve({ success: false, error: 'Shortcut execution timed out.' });
        }
      }, timeoutMs);

      this.pendingShortcuts.set(id, { resolve, timer });
      const sent = this.sendCommand({ cmd: 'execute_shortcut', id, keys });
      if (!sent) {
        clearTimeout(timer);
        this.pendingShortcuts.delete(id);
        resolve({ success: false, error: 'Bridge process is not available.' });
      }
    });
  }

  simulateKey(keyChar) {
    return this.sendCommand({ cmd: 'simulate_key', key: String(keyChar) });
  }

  clearBuffer() {
    return this.sendCommand({ cmd: 'clear' });
  }

  reconnect(mac = null) {
    return this.sendCommand({ cmd: 'reconnect', mac });
  }

  getStatus() {
    return { ...this.status };
  }

  stop() {
    this.shouldRestart = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.child) {
      try {
        this.sendCommand({ cmd: 'exit' });
        setTimeout(() => {
          if (this.child) {
            this.child.kill('SIGTERM');
          }
        }, 500);
      } catch (err) {
        // ignore
      }
    }
  }
}

module.exports = BackendManager;
