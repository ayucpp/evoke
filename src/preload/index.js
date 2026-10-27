const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('evoke', {
  // Keymap APIs
  getKeymap: () => ipcRenderer.invoke('keymap:get'),
  saveKey: (keyId, config) => ipcRenderer.invoke('keymap:save-key', keyId, config),
  resetKey: (keyId) => ipcRenderer.invoke('keymap:reset-key', keyId),
  resetAllKeys: () => ipcRenderer.invoke('keymap:reset-all'),
  exportKeymap: () => ipcRenderer.invoke('keymap:export'),
  importKeymap: () => ipcRenderer.invoke('keymap:import'),

  // Action Testing & Execution
  testAction: (keyConfig) => ipcRenderer.invoke('action:test', keyConfig),

  // File Selection
  selectFile: (type) => ipcRenderer.invoke('dialog:select-file', type),

  // Bluetooth & Hardware APIs
  getBluetoothStatus: () => ipcRenderer.invoke('bt:get-status'),
  reconnectBluetooth: (mac) => ipcRenderer.invoke('bt:reconnect', mac),
  clearBuffer: () => ipcRenderer.invoke('bt:clear-buffer'),
  simulateKey: (keyChar) => ipcRenderer.invoke('bt:simulate-key', keyChar),

  // Settings APIs
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Event Listeners (renderer subscribes to main push events)
  onKeyEvent: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('bt:key-event', handler);
    return () => ipcRenderer.removeListener('bt:key-event', handler);
  },
  onBluetoothStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('bt:status', handler);
    return () => ipcRenderer.removeListener('bt:status', handler);
  },
  onActionExecuted: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('action:executed', handler);
    return () => ipcRenderer.removeListener('action:executed', handler);
  },
  onLog: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('log:entry', handler);
    return () => ipcRenderer.removeListener('log:entry', handler);
  }
});
