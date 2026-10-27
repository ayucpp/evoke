const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ConfigStore = require('./config_store');
const ActionExecutor = require('./action_executor');
const BackendManager = require('./backend_manager');

// Disable Linux Chromium user namespace sandbox to ensure container compatibility
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

let mainWindow = null;
let configStore = null;
let actionExecutor = null;
let backendManager = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: 'EVOKE — ESP32 Keypad Companion',
    backgroundColor: '#0B0C0D',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Remove default menu bar for clean desktop feel
  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // 1. Initialize configuration store
    configStore = new ConfigStore();

    // 2. Initialize action executor
    actionExecutor = new ActionExecutor({
      debounceMs: configStore.settings.debounceMs || 250
    });

    // 3. Initialize Python Bluetooth bridge
    backendManager = new BackendManager({
      pythonPath: configStore.settings.pythonInterpreter || undefined
    });
    actionExecutor.setBridgeManager(backendManager);

    // Forward bridge events to renderer and action dispatcher
    backendManager.on('key', async (keyMsg) => {
      if (!mainWindow) return;

      // Broadcast key event to UI for visual lighting
      mainWindow.webContents.send('bt:key-event', keyMsg);

      // Find configured key
      const keyConfig = configStore.getKeyByPhysicalKey(keyMsg.key);
      if (keyConfig) {
        const result = await actionExecutor.executeKey(keyConfig, keyMsg.simulated ? 'simulated' : 'hardware');
        mainWindow.webContents.send('action:executed', result);
      }
    });

    backendManager.on('status', (status) => {
      if (mainWindow) {
        mainWindow.webContents.send('bt:status', status);
      }
    });

    backendManager.on('log', (logEntry) => {
      if (mainWindow) {
        mainWindow.webContents.send('log:entry', logEntry);
      }
    });

    // Start background bridge if autoConnect is enabled
    if (configStore.settings.autoConnect !== false) {
      backendManager.start();
    }

    // Register IPC handlers
    registerIpcHandlers();

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

function registerIpcHandlers() {
  // Keymap management
  ipcMain.handle('keymap:get', async () => {
    return configStore.keymap;
  });

  ipcMain.handle('keymap:save-key', async (event, keyId, newConfig) => {
    return configStore.updateKey(keyId, newConfig);
  });

  ipcMain.handle('keymap:reset-key', async (event, keyId) => {
    return configStore.resetKey(keyId);
  });

  ipcMain.handle('keymap:reset-all', async () => {
    return configStore.resetAll();
  });

  ipcMain.handle('keymap:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Keymap Configuration',
      defaultPath: 'evoke_keymap.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (canceled || !filePath) return { success: false, canceled: true };
    return configStore.exportKeymap(filePath);
  });

  ipcMain.handle('keymap:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Keymap Configuration',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (canceled || !filePaths.length) return { success: false, canceled: true };
    return configStore.importKeymap(filePaths[0]);
  });

  // Action testing
  ipcMain.handle('action:test', async (event, keyConfig) => {
    const result = await actionExecutor.executeKey(keyConfig, 'test');
    if (mainWindow) {
      mainWindow.webContents.send('action:executed', result);
    }
    return result;
  });

  // File Picker
  ipcMain.handle('dialog:select-file', async (event, type) => {
    let filters = [];
    let title = 'Select File';

    if (type === 'python') {
      title = 'Select Python Script';
      filters = [{ name: 'Python Scripts (*.py)', extensions: ['py'] }, { name: 'All Files', extensions: ['*'] }];
    } else if (type === 'app') {
      title = 'Select Executable or Application';
      filters = [{ name: 'Executables & Binaries', extensions: ['*', 'sh', 'bin', 'AppImage', 'desktop'] }];
    }

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title,
      filters,
      properties: ['openFile']
    });

    if (canceled || !filePaths.length) return null;
    return filePaths[0];
  });

  // Hardware / Bluetooth controls
  ipcMain.handle('bt:get-status', async () => {
    return backendManager.getStatus();
  });

  ipcMain.handle('bt:reconnect', async (event, mac) => {
    backendManager.reconnect(mac);
    return { success: true };
  });

  ipcMain.handle('bt:clear-buffer', async () => {
    backendManager.clearBuffer();
    return { success: true };
  });

  ipcMain.handle('bt:simulate-key', async (event, keyChar) => {
    backendManager.simulateKey(keyChar);
    return { success: true };
  });

  // Settings
  ipcMain.handle('settings:get', async () => {
    return configStore.settings;
  });

  ipcMain.handle('settings:save', async (event, newSettings) => {
    const res = configStore.saveSettings(newSettings);
    if (newSettings.debounceMs) {
      actionExecutor.debounceMs = newSettings.debounceMs;
    }
    return res;
  });
}

app.on('before-quit', () => {
  if (backendManager) {
    backendManager.stop();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
