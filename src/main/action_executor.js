const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ActionExecutor {
  constructor(options = {}) {
    this.bridgeManager = options.bridgeManager || null;
    this.debounceMs = options.debounceMs || 250;
    this.lastKeyTimes = new Map();
    this.defaultPython = this.findDefaultPython();
  }

  setBridgeManager(bridgeManager) {
    this.bridgeManager = bridgeManager;
  }

  findDefaultPython() {
    const venvPython = path.resolve(__dirname, '../../.venv/bin/python3');
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }
    return 'python3';
  }

  isDebounced(keyChar) {
    const now = Date.now();
    const lastTime = this.lastKeyTimes.get(keyChar) || 0;
    if (now - lastTime < this.debounceMs) {
      return true;
    }
    this.lastKeyTimes.set(keyChar, now);
    return false;
  }

  async executeKey(keyConfig, source = 'hardware') {
    if (!keyConfig) {
      return { success: false, error: 'No key configuration provided.' };
    }

    if (source === 'hardware' && keyConfig.keyLabel && this.isDebounced(keyConfig.keyLabel)) {
      return { success: false, debounced: true, message: `Key ${keyConfig.keyLabel} debounced.` };
    }

    const startTime = Date.now();
    const { actionType, settings = {}, name, id, keyLabel } = keyConfig;

    try {
      let result;
      switch (actionType) {
        case 'app':
          result = await this.executeApp(settings);
          break;
        case 'shortcut':
          result = await this.executeShortcut(settings);
          break;
        case 'macro':
          result = await this.executeMacro(settings);
          break;
        case 'python':
          result = await this.executePython(settings);
          break;
        case 'none':
        default:
          result = { success: true, message: 'Key has no assigned action.' };
          break;
      }

      const durationMs = Date.now() - startTime;
      return {
        keyId: id,
        keyLabel,
        name,
        actionType,
        durationMs,
        ...result
      };
    } catch (err) {
      return {
        keyId: id,
        keyLabel,
        name,
        actionType,
        success: false,
        error: err.message,
        durationMs: Date.now() - startTime
      };
    }
  }

  executeApp(settings) {
    return new Promise((resolve) => {
      const appPath = (settings.path || '').trim();
      if (!appPath) {
        return resolve({ success: false, error: 'Application path or command is empty.' });
      }

      const rawArgs = (settings.args || '').trim();
      const args = rawArgs ? rawArgs.match(/(?:[^\s"]+|"[^"]*")+/g).map(a => a.replace(/^"|"$/g, '')) : [];

      try {
        const child = spawn(appPath, args, {
          detached: true,
          stdio: 'ignore',
          shell: true
        });

        child.on('error', (err) => {
          resolve({ success: false, error: `Failed to launch app: ${err.message}` });
        });

        // Detach so process runs independently
        child.unref();

        resolve({
          success: true,
          message: `Launched: ${appPath} ${args.join(' ')}`.trim()
        });
      } catch (err) {
        resolve({ success: false, error: `Launch error: ${err.message}` });
      }
    });
  }

  async executeShortcut(settings) {
    const keys = Array.isArray(settings.keys) ? settings.keys : [];
    if (keys.length === 0) {
      return { success: false, error: 'Shortcut contains no keys.' };
    }

    if (this.bridgeManager && typeof this.bridgeManager.sendShortcut === 'function') {
      try {
        const result = await this.bridgeManager.sendShortcut(keys);
        return result;
      } catch (err) {
        return { success: false, error: `Shortcut dispatch failed: ${err.message}` };
      }
    }

    // Fallback: spawn standalone python shortcut execution if bridge not connected
    return this.executeStandaloneShortcut(keys);
  }

  executeStandaloneShortcut(keys) {
    return new Promise((resolve) => {
      const script = `
import sys, time
from pynput.keyboard import Controller, Key, KeyCode
c = Controller()
mod_map = {
    'ctrl': Key.ctrl, 'shift': Key.shift, 'alt': Key.alt, 'super': Key.cmd,
    'cmd': Key.cmd, 'tab': Key.tab, 'enter': Key.enter, 'esc': Key.esc,
    'space': Key.space, 'backspace': Key.backspace, 'delete': Key.delete,
    'f1': Key.f1, 'f2': Key.f2, 'f3': Key.f3, 'f4': Key.f4,
    'f5': Key.f5, 'f6': Key.f6, 'f7': Key.f7, 'f8': Key.f8,
    'f9': Key.f9, 'f10': Key.f10, 'f11': Key.f11, 'f12': Key.f12,
    'volume_up': Key.media_volume_up, 'volume_down': Key.media_volume_down,
    'mute': Key.media_volume_mute, 'play_pause': Key.media_play_pause
}
keys = ${JSON.stringify(keys)}
res = [mod_map.get(k.lower(), KeyCode.from_char(k[0])) for k in keys]
for k in res: c.press(k)
time.sleep(0.05)
for k in reversed(res): c.release(k)
print("OK")
`;
      const pythonBin = this.defaultPython;
      const child = spawn(pythonBin, ['-c', script]);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });

      child.on('close', code => {
        if (code === 0) {
          resolve({ success: true, message: `Executed shortcut: ${keys.join(' + ')}` });
        } else {
          resolve({ success: false, error: stderr.trim() || `Exit code ${code}` });
        }
      });
      child.on('error', err => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  async executeMacro(settings) {
    const steps = Array.isArray(settings.steps) ? settings.steps : [];
    if (steps.length === 0) {
      return { success: false, error: 'Macro has no steps.' };
    }

    const stepResults = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.type === 'delay') {
        const ms = Math.max(10, parseInt(step.delayMs || step.delay || 100, 10));
        await new Promise(r => setTimeout(r, ms));
        stepResults.push({ step: i + 1, type: 'delay', delayMs: ms, success: true });
      } else if (step.type === 'app') {
        const res = await this.executeApp(step);
        stepResults.push({ step: i + 1, type: 'app', ...res });
        if (!res.success) {
          return { success: false, error: `Macro step ${i + 1} (App) failed: ${res.error}`, steps: stepResults };
        }
      } else if (step.type === 'shortcut') {
        const res = await this.executeShortcut(step);
        stepResults.push({ step: i + 1, type: 'shortcut', ...res });
        if (!res.success) {
          return { success: false, error: `Macro step ${i + 1} (Shortcut) failed: ${res.error}`, steps: stepResults };
        }
      } else if (step.type === 'python') {
        const res = await this.executePython(step);
        stepResults.push({ step: i + 1, type: 'python', ...res });
        if (!res.success) {
          return { success: false, error: `Macro step ${i + 1} (Python) failed: ${res.error}`, steps: stepResults };
        }
      }
    }

    return { success: true, message: `Completed ${steps.length} macro steps.`, steps: stepResults };
  }

  executePython(settings) {
    return new Promise((resolve) => {
      const scriptPath = (settings.scriptPath || '').trim();
      if (!scriptPath) {
        return resolve({ success: false, error: 'Python script path is empty.' });
      }

      if (!fs.existsSync(scriptPath)) {
        return resolve({ success: false, error: `Script file not found: ${scriptPath}` });
      }

      const pythonInterpreter = (settings.pythonInterpreter || '').trim() || this.defaultPython;
      const rawArgs = (settings.args || '').trim();
      const scriptArgs = rawArgs ? rawArgs.match(/(?:[^\s"]+|"[^"]*")+/g).map(a => a.replace(/^"|"$/g, '')) : [];

      const spawnArgs = [scriptPath, ...scriptArgs];
      const child = spawn(pythonInterpreter, spawnArgs, {
        cwd: path.dirname(scriptPath),
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, 15000); // 15s max execution time

      child.stdout.on('data', data => {
        stdout += data.toString();
      });

      child.stderr.on('data', data => {
        stderr += data.toString();
      });

      child.on('error', err => {
        clearTimeout(timeout);
        resolve({ success: false, error: `Failed to spawn Python process: ${err.message}` });
      });

      child.on('close', code => {
        clearTimeout(timeout);
        if (timedOut) {
          return resolve({ success: false, error: 'Script execution timed out after 15 seconds.' });
        }
        resolve({
          success: code === 0,
          exitCode: code,
          output: stdout.trim(),
          error: code !== 0 ? (stderr.trim() || `Exit code ${code}`) : (stderr.trim() || null)
        });
      });
    });
  }
}

module.exports = ActionExecutor;
