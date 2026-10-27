const fs = require('fs');
const path = require('path');

// Default 16-key matrix layout matching ESP32 firmware
const DEFAULT_KEY_DEFINITIONS = [
  // Row 1
  { id: 'k1', keyLabel: '1', row: 1, col: 1, name: 'Launch Terminal', actionType: 'app', settings: { path: 'x-terminal-emulator', args: '', testMode: false } },
  { id: 'k2', keyLabel: '2', row: 1, col: 2, name: 'Copy', actionType: 'shortcut', settings: { keys: ['ctrl', 'c'], label: 'Ctrl + C' } },
  { id: 'k3', keyLabel: '3', row: 1, col: 3, name: 'Paste', actionType: 'shortcut', settings: { keys: ['ctrl', 'v'], label: 'Ctrl + V' } },
  { id: 'k4', keyLabel: 'A', row: 1, col: 4, name: 'System Status', actionType: 'python', settings: { scriptPath: path.resolve(__dirname, '../../scripts/system_status.py'), pythonInterpreter: 'python3', args: '--summary' } },

  // Row 2
  { id: 'k5', keyLabel: '4', row: 2, col: 1, name: 'Select All', actionType: 'shortcut', settings: { keys: ['ctrl', 'a'], label: 'Ctrl + A' } },
  { id: 'k6', keyLabel: '5', row: 2, col: 2, name: 'Save File', actionType: 'shortcut', settings: { keys: ['ctrl', 's'], label: 'Ctrl + S' } },
  { id: 'k7', keyLabel: '6', row: 2, col: 3, name: 'Undo', actionType: 'shortcut', settings: { keys: ['ctrl', 'z'], label: 'Ctrl + Z' } },
  { id: 'k8', keyLabel: 'B', row: 2, col: 4, name: 'Quick Dev Macro', actionType: 'macro', settings: {
      steps: [
        { type: 'shortcut', keys: ['ctrl', 's'], label: 'Save (Ctrl+S)' },
        { type: 'delay', delayMs: 150 },
        { type: 'shortcut', keys: ['ctrl', 'r'], label: 'Reload (Ctrl+R)' }
      ]
    }
  },

  // Row 3
  { id: 'k9', keyLabel: '7', row: 3, col: 1, name: 'Browser', actionType: 'app', settings: { path: 'xdg-open', args: 'https://github.com' } },
  { id: 'k10', keyLabel: '8', row: 3, col: 2, name: 'Switch App', actionType: 'shortcut', settings: { keys: ['alt', 'tab'], label: 'Alt + Tab' } },
  { id: 'k11', keyLabel: '9', row: 3, col: 3, name: 'Mute / Unmute', actionType: 'shortcut', settings: { keys: ['ctrl', 'shift', 'm'], label: 'Ctrl + Shift + M' } },
  { id: 'k12', keyLabel: 'C', row: 3, col: 4, name: 'Memory Stats', actionType: 'python', settings: { scriptPath: path.resolve(__dirname, '../../scripts/system_status.py'), pythonInterpreter: 'python3', args: '--memory' } },

  // Row 4
  { id: 'k13', keyLabel: '*', row: 4, col: 1, name: 'Clear Buffer', actionType: 'none', settings: {} },
  { id: 'k14', keyLabel: '0', row: 4, col: 2, name: 'Lock Screen', actionType: 'shortcut', settings: { keys: ['super', 'l'], label: 'Super + L' } },
  { id: 'k15', keyLabel: '#', row: 4, col: 3, name: 'Unassigned', actionType: 'none', settings: {} },
  { id: 'k16', keyLabel: 'D', row: 4, col: 4, name: 'Unassigned', actionType: 'none', settings: {} }
];

const DEFAULT_SETTINGS = {
  theme: 'dark',
  debounceMs: 250,
  bluetoothMac: '',
  pythonInterpreter: 'python3',
  autoConnect: true,
  simulationMode: false,
  soundEffects: true
};

class ConfigStore {
  constructor(customPath = null) {
    this.configDir = customPath ? path.dirname(customPath) : path.resolve(__dirname, '../../config');
    this.configPath = customPath || path.join(this.configDir, 'keymap.json');
    this.settingsPath = path.join(this.configDir, 'settings.json');
    this.ensureDirectory();
    this.keymap = this.loadKeymap();
    this.settings = this.loadSettings();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.configDir)) {
      try {
        fs.mkdirSync(this.configDir, { recursive: true });
      } catch (err) {
        console.error('Failed to create config directory:', err);
      }
    }
  }

  getDefaultKeymap() {
    return JSON.parse(JSON.stringify(DEFAULT_KEY_DEFINITIONS));
  }

  getDefaultSettings() {
    return { ...DEFAULT_SETTINGS };
  }

  loadKeymap() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 16) {
          return this.validateAndNormalizeKeymap(parsed);
        }
      }
    } catch (err) {
      console.warn(`[ConfigStore] Could not parse keymap at ${this.configPath}, restoring defaults:`, err.message);
    }
    const defaults = this.getDefaultKeymap();
    this.saveKeymap(defaults);
    return defaults;
  }

  validateAndNormalizeKeymap(keys) {
    const defaultMap = new Map(DEFAULT_KEY_DEFINITIONS.map(k => [k.id, k]));
    return keys.map((key, idx) => {
      const fallback = DEFAULT_KEY_DEFINITIONS[idx] || { id: `k${idx+1}`, keyLabel: String(idx+1) };
      const id = key.id || fallback.id;
      const keyLabel = key.keyLabel || fallback.keyLabel;
      const row = key.row || fallback.row || Math.floor(idx / 4) + 1;
      const col = key.col || fallback.col || (idx % 4) + 1;
      const name = typeof key.name === 'string' ? key.name.trim() : fallback.name;
      const validTypes = ['app', 'shortcut', 'macro', 'python', 'none'];
      const actionType = validTypes.includes(key.actionType) ? key.actionType : 'none';
      const settings = (typeof key.settings === 'object' && key.settings !== null) ? key.settings : {};

      return {
        id,
        keyLabel,
        row,
        col,
        name: name || (actionType === 'none' ? 'Unassigned' : 'Custom Action'),
        actionType,
        settings
      };
    });
  }

  saveKeymap(keymapData = null) {
    try {
      this.ensureDirectory();
      const dataToSave = keymapData || this.keymap;
      fs.writeFileSync(this.configPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
      this.keymap = dataToSave;
      return { success: true };
    } catch (err) {
      console.error('[ConfigStore] Failed to save keymap:', err);
      return { success: false, error: err.message };
    }
  }

  getKey(keyId) {
    return this.keymap.find(k => k.id.toLowerCase() === keyId.toLowerCase()) || null;
  }

  getKeyByPhysicalKey(charKey) {
    if (!charKey) return null;
    return this.keymap.find(k => String(k.keyLabel).toUpperCase() === String(charKey).toUpperCase()) || null;
  }

  updateKey(keyId, newConfig) {
    const index = this.keymap.findIndex(k => k.id.toLowerCase() === keyId.toLowerCase());
    if (index === -1) {
      return { success: false, error: `Key '${keyId}' not found.` };
    }

    const current = this.keymap[index];
    const validTypes = ['app', 'shortcut', 'macro', 'python', 'none'];
    const actionType = validTypes.includes(newConfig.actionType) ? newConfig.actionType : current.actionType;

    this.keymap[index] = {
      ...current,
      name: typeof newConfig.name === 'string' ? newConfig.name.trim() : current.name,
      actionType,
      settings: typeof newConfig.settings === 'object' ? newConfig.settings : current.settings
    };

    const saveResult = this.saveKeymap();
    return {
      success: saveResult.success,
      key: this.keymap[index],
      error: saveResult.error
    };
  }

  resetKey(keyId) {
    const defaultKey = DEFAULT_KEY_DEFINITIONS.find(k => k.id.toLowerCase() === keyId.toLowerCase());
    if (!defaultKey) {
      return { success: false, error: `Default definition for '${keyId}' not found.` };
    }
    return this.updateKey(keyId, {
      name: defaultKey.name,
      actionType: defaultKey.actionType,
      settings: defaultKey.settings
    });
  }

  resetAll() {
    this.keymap = this.getDefaultKeymap();
    this.saveKeymap();
    return { success: true, keymap: this.keymap };
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf-8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.warn('[ConfigStore] Error reading settings, using defaults:', err.message);
    }
    return this.getDefaultSettings();
  }

  saveSettings(newSettings) {
    try {
      this.ensureDirectory();
      this.settings = { ...this.settings, ...newSettings };
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
      return { success: true, settings: this.settings };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  exportKeymap(exportFilePath) {
    try {
      const payload = {
        app: 'EVOKE',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        keymap: this.keymap
      };
      fs.writeFileSync(exportFilePath, JSON.stringify(payload, null, 2), 'utf-8');
      return { success: true, path: exportFilePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  importKeymap(importFilePath) {
    try {
      if (!fs.existsSync(importFilePath)) {
        return { success: false, error: 'File does not exist.' };
      }
      const raw = fs.readFileSync(importFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      let candidateKeys = null;

      if (Array.isArray(parsed)) {
        candidateKeys = parsed;
      } else if (parsed && Array.isArray(parsed.keymap)) {
        candidateKeys = parsed.keymap;
      }

      if (!candidateKeys || candidateKeys.length !== 16) {
        return { success: false, error: 'Invalid keymap format: must contain exactly 16 key definitions.' };
      }

      this.keymap = this.validateAndNormalizeKeymap(candidateKeys);
      this.saveKeymap();
      return { success: true, keymap: this.keymap };
    } catch (err) {
      return { success: false, error: `Failed to import keymap: ${err.message}` };
    }
  }
}

module.exports = ConfigStore;
