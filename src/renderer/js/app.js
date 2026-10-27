// EVOKE — Desktop Companion Application Logic

document.addEventListener('DOMContentLoaded', async () => {
  // ==========================================================================
  // 1. Application State
  // ==========================================================================
  let keymap = [];
  let selectedKeyId = 'k1';
  let activeTab = 'dashboard';
  let settings = {
    theme: 'dark',
    debounceMs: 250,
    bluetoothMac: '',
    pythonInterpreter: 'python3',
    autoConnect: true,
    simulationMode: false
  };

  let currentMacroSteps = [];
  let currentShortcutKeys = ['ctrl', 'c'];
  let isRecordingShortcut = false;

  // Audio Context for tactile feedback tone
  let audioCtx = null;
  function playKeyBeep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 tone
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {
      // Audio not supported or blocked
    }
  }

  // ==========================================================================
  // 2. DOM Elements
  // ==========================================================================
  const matrixGrid = document.getElementById('matrix-grid');
  const mappingsTableBody = document.getElementById('mappings-table-body');
  const logStream = document.getElementById('log-stream');
  const toastContainer = document.getElementById('toast-container');

  // Topbar & Sidebar status
  const sidebarStatusDot = document.getElementById('sidebar-status-dot');
  const sidebarStatusText = document.getElementById('sidebar-status-text');
  const sidebarMacText = document.getElementById('sidebar-mac-text');
  const connectionBadge = document.getElementById('connection-badge');
  const badgeStatusText = document.getElementById('badge-status-text');
  const telemetryActiveKey = document.getElementById('telemetry-active-key');
  const telemetryBuffer = document.getElementById('telemetry-buffer');
  const btnClearBuffer = document.getElementById('btn-clear-buffer');
  const btnReconnectQuick = document.getElementById('btn-reconnect-quick');

  // Inspector Elements
  const inspKeyId = document.getElementById('insp-key-id');
  const inspPhysKey = document.getElementById('insp-phys-key');
  const cfgName = document.getElementById('cfg-name');
  const actionTypeTabs = document.getElementById('action-type-tabs');
  const actionPanels = {
    app: document.getElementById('panel-app'),
    shortcut: document.getElementById('panel-shortcut'),
    macro: document.getElementById('panel-macro'),
    python: document.getElementById('panel-python'),
    none: document.getElementById('panel-none')
  };

  // App panel inputs
  const cfgAppPath = document.getElementById('cfg-app-path');
  const cfgAppArgs = document.getElementById('cfg-app-args');
  const btnBrowseApp = document.getElementById('btn-browse-app');

  // Shortcut panel inputs
  const shortcutBadgeContainer = document.getElementById('shortcut-badge-container');
  const btnRecordShortcut = document.getElementById('btn-record-shortcut');
  const cfgShortcutPreset = document.getElementById('cfg-shortcut-preset');
  const cfgShortcutManual = document.getElementById('cfg-shortcut-manual');
  const btnApplyManualShortcut = document.getElementById('btn-apply-manual-shortcut');

  // Macro panel inputs
  const macroStepList = document.getElementById('macro-step-list');
  const btnAddStepApp = document.getElementById('btn-add-step-app');
  const btnAddStepKey = document.getElementById('btn-add-step-key');
  const btnAddStepDelay = document.getElementById('btn-add-step-delay');

  // Python panel inputs
  const cfgPyPath = document.getElementById('cfg-py-path');
  const cfgPyArgs = document.getElementById('cfg-py-args');
  const cfgPyInterp = document.getElementById('cfg-py-interp');
  const btnBrowsePy = document.getElementById('btn-browse-py');

  // Inspector actions
  const btnSaveKey = document.getElementById('btn-save-key');
  const btnResetSingleKey = document.getElementById('btn-reset-single-key');
  const btnClearMapping = document.getElementById('btn-clear-mapping');
  const btnTestAction = document.getElementById('btn-test-action');
  const testResultBox = document.getElementById('test-result-box');
  const testResultBadge = document.getElementById('test-result-badge');
  const testResultTime = document.getElementById('test-result-time');
  const testResultOutput = document.getElementById('test-result-output');

  // Settings inputs
  const setTargetMac = document.getElementById('set-target-mac');
  const btnSaveMac = document.getElementById('btn-save-mac');
  const setDebounce = document.getElementById('set-debounce');
  const setAutoconnect = document.getElementById('set-autoconnect');
  const setSimulation = document.getElementById('set-simulation');
  const setThemeSelect = document.getElementById('set-theme-select');
  const setPythonBin = document.getElementById('set-python-bin');
  const btnSaveGeneralSettings = document.getElementById('btn-save-general-settings');

  // Mappings table action buttons
  const btnExportKeymap = document.getElementById('btn-export-keymap');
  const btnImportKeymap = document.getElementById('btn-import-keymap');
  const btnResetAllKeys = document.getElementById('btn-reset-all-keys');

  // ==========================================================================
  // 3. Navigation & Views
  // ==========================================================================
  const navItems = document.querySelectorAll('.nav-item');
  const viewPanels = document.querySelectorAll('.view-panel');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  const titles = {
    dashboard: { title: 'Keypad Dashboard', sub: 'Configure 16 programmable physical keys' },
    mappings: { title: 'All Mappings', sub: 'Comprehensive matrix overview and backup' },
    settings: { title: 'Settings', sub: 'Bluetooth, hardware debouncing, and preferences' },
    diagnostics: { title: 'Hardware Diagnostics', sub: 'Live Bluetooth packets and execution logs' }
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      switchTab(tab);
    });
  });

  function switchTab(tab) {
    activeTab = tab;
    navItems.forEach(i => i.classList.toggle('active', i.dataset.tab === tab));
    viewPanels.forEach(p => p.classList.toggle('active', p.id === `view-${tab}`));
    if (titles[tab]) {
      pageTitle.textContent = titles[tab].title;
      pageSubtitle.textContent = titles[tab].sub;
    }
    if (tab === 'mappings') {
      renderMappingsTable();
    }
  }

  // ==========================================================================
  // 4. Initialization
  // ==========================================================================
  async function init() {
    try {
      // 1. Load settings
      if (window.evoke && window.evoke.getSettings) {
        settings = await window.evoke.getSettings();
        applySettingsToUI();
      }

      // 2. Load keymap
      if (window.evoke && window.evoke.getKeymap) {
        keymap = await window.evoke.getKeymap();
        renderKeypadGrid();
        renderMappingsTable();
        selectKey(selectedKeyId);
      }

      // 3. Load Bluetooth initial status
      if (window.evoke && window.evoke.getBluetoothStatus) {
        const btStatus = await window.evoke.getBluetoothStatus();
        updateBluetoothUI(btStatus);
      }

      // 4. Setup listeners
      setupEventListeners();

      addLog('info', 'EVOKE ready. 16 keypad channels initialized.');
    } catch (err) {
      console.error('Initialization error:', err);
      addLog('error', `Init error: ${err.message}`);
    }
  }

  function applySettingsToUI() {
    if (settings.theme) {
      document.documentElement.setAttribute('data-theme', settings.theme);
      setThemeSelect.value = settings.theme;
    }
    if (settings.bluetoothMac) {
      setTargetMac.value = settings.bluetoothMac;
      sidebarMacText.textContent = settings.bluetoothMac;
    }
    if (settings.debounceMs) {
      setDebounce.value = settings.debounceMs;
    }
    setAutoconnect.checked = settings.autoConnect !== false;
    setSimulation.checked = !!settings.simulationMode;
    if (settings.pythonInterpreter) {
      setPythonBin.value = settings.pythonInterpreter;
      cfgPyInterp.value = settings.pythonInterpreter;
    }
  }

  // ==========================================================================
  // 5. 4x4 Keypad Grid Rendering
  // ==========================================================================
  function renderKeypadGrid() {
    matrixGrid.innerHTML = '';

    keymap.forEach((k) => {
      const tile = document.createElement('div');
      tile.className = `key-tile ${k.id === selectedKeyId ? 'selected' : ''}`;
      tile.dataset.keyId = k.id;
      tile.dataset.physKey = k.keyLabel;

      const isConfigured = k.actionType !== 'none';
      const typeDisplay = getActionTypeDisplay(k.actionType);

      tile.innerHTML = `
        <div class="tile-top">
          <span class="tile-id">${k.id.toUpperCase()}</span>
          <span class="tile-phys-key">${k.keyLabel}</span>
        </div>
        <div class="tile-middle">
          <div class="tile-action-name" title="${escapeHtml(k.name || 'Unassigned')}">${escapeHtml(k.name || 'Unassigned')}</div>
        </div>
        <div class="tile-bottom">
          <span class="tile-type-badge">
            <span class="dot ${k.actionType}"></span>
            ${typeDisplay}
          </span>
          <span class="tile-status-dot ${isConfigured ? 'configured' : ''}" title="${isConfigured ? 'Configured' : 'Unconfigured'}"></span>
        </div>
      `;

      tile.addEventListener('click', () => {
        selectKey(k.id);
        if (settings.simulationMode) {
          triggerPhysicalKeyFeedback(k.keyLabel);
          if (window.evoke && window.evoke.simulateKey) {
            window.evoke.simulateKey(k.keyLabel);
          }
        }
      });

      matrixGrid.appendChild(tile);
    });
  }

  function getActionTypeDisplay(type) {
    switch (type) {
      case 'app': return 'App';
      case 'shortcut': return 'Key';
      case 'macro': return 'Macro';
      case 'python': return 'Python';
      default: return 'None';
    }
  }

  function selectKey(keyId) {
    selectedKeyId = keyId;
    const key = keymap.find(k => k.id.toLowerCase() === keyId.toLowerCase());
    if (!key) return;

    // Highlight selected tile
    document.querySelectorAll('.key-tile').forEach(t => {
      t.classList.toggle('selected', t.dataset.keyId === keyId);
    });

    // Populate inspector header
    inspKeyId.textContent = key.id.toUpperCase();
    inspPhysKey.textContent = `Pin / Key '${key.keyLabel}' (R${key.row}C${key.col})`;
    cfgName.value = key.name || '';

    // Switch action type tab
    const actionType = key.actionType || 'none';
    switchActionTypeTab(actionType);

    // Populate action settings
    populateActionSettings(key);

    // Hide test result
    testResultBox.style.display = 'none';
  }

  function switchActionTypeTab(type) {
    document.querySelectorAll('#action-type-tabs .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    Object.keys(actionPanels).forEach(key => {
      if (actionPanels[key]) {
        actionPanels[key].classList.toggle('active', key === type);
      }
    });
  }

  actionTypeTabs.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-btn')) {
      const type = e.target.dataset.type;
      switchActionTypeTab(type);
    }
  });

  function populateActionSettings(key) {
    const s = key.settings || {};

    // App
    cfgAppPath.value = s.path || '';
    cfgAppArgs.value = s.args || '';

    // Shortcut
    currentShortcutKeys = Array.isArray(s.keys) && s.keys.length > 0 ? s.keys : ['ctrl', 'c'];
    if (cfgShortcutManual) cfgShortcutManual.value = currentShortcutKeys.map(formatKeyLabel).join('+');
    renderShortcutChips();

    // Macro
    currentMacroSteps = Array.isArray(s.steps) ? JSON.parse(JSON.stringify(s.steps)) : [];
    renderMacroSteps();

    // Python
    cfgPyPath.value = s.scriptPath || '';
    cfgPyArgs.value = s.args || '';
    cfgPyInterp.value = s.pythonInterpreter || settings.pythonInterpreter || 'python3';
  }

  // ==========================================================================
  // 6. Shortcut Recorder & Manual Configuration
  // ==========================================================================
  function renderShortcutChips() {
    shortcutBadgeContainer.innerHTML = '';
    currentShortcutKeys.forEach((k, idx) => {
      const chip = document.createElement('span');
      chip.className = 'key-chip';
      chip.textContent = formatKeyLabel(k);
      shortcutBadgeContainer.appendChild(chip);

      if (idx < currentShortcutKeys.length - 1) {
        const plus = document.createElement('span');
        plus.className = 'key-chip-plus';
        plus.textContent = '+';
        shortcutBadgeContainer.appendChild(plus);
      }
    });
  }

  function formatKeyLabel(k) {
    if (!k) return '';
    const norm = String(k).trim().toLowerCase();
    const map = {
      ctrl: 'Ctrl',
      control: 'Ctrl',
      shift: 'Shift',
      alt: 'Alt',
      super: 'Super',
      cmd: 'Cmd',
      meta: 'Meta',
      win: 'Win',
      tab: 'Tab',
      enter: 'Enter',
      esc: 'Esc',
      escape: 'Esc',
      space: 'Space',
      backspace: 'Bksp',
      delete: 'Del',
      volume_up: 'Vol Up',
      volume_down: 'Vol Down',
      mute: 'Mute',
      play_pause: 'Play/Pause',
      next_track: 'Next Track',
      prev_track: 'Prev Track',
      print_screen: 'PrtScn',
      insert: 'Ins'
    };
    if (map[norm]) return map[norm];
    if (/^f([1-9]|1[0-9]|2[0-4])$/.test(norm)) {
      return norm.toUpperCase();
    }
    return norm.length === 1 ? norm.toUpperCase() : (norm.charAt(0).toUpperCase() + norm.slice(1));
  }

  function normalizeKey(e) {
    // Check function keys first (both e.key and e.code)
    if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(e.key)) {
      return e.key.toLowerCase();
    }
    if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(e.code)) {
      return e.code.toLowerCase();
    }

    // Media keys
    if (e.key === 'AudioVolumeUp' || e.code === 'AudioVolumeUp') return 'volume_up';
    if (e.key === 'AudioVolumeDown' || e.code === 'AudioVolumeDown') return 'volume_down';
    if (e.key === 'AudioVolumeMute' || e.code === 'AudioVolumeMute') return 'mute';
    if (e.key === 'MediaPlayPause' || e.code === 'MediaPlayPause') return 'play_pause';
    if (e.key === 'MediaTrackNext' || e.code === 'MediaTrackNext') return 'next_track';
    if (e.key === 'MediaTrackPrevious' || e.code === 'MediaTrackPrevious') return 'prev_track';
    if (e.key === 'PrintScreen' || e.code === 'PrintScreen') return 'print_screen';

    // Special keys
    const specialMap = {
      'Escape': 'esc',
      'Tab': 'tab',
      'Enter': 'enter',
      'Backspace': 'backspace',
      'Delete': 'delete',
      ' ': 'space',
      'Space': 'space',
      'ArrowUp': 'up',
      'ArrowDown': 'down',
      'ArrowLeft': 'left',
      'ArrowRight': 'right',
      'Home': 'home',
      'End': 'end',
      'PageUp': 'pageup',
      'PageDown': 'pagedown'
    };
    if (specialMap[e.key]) return specialMap[e.key];

    // Standard character keys
    if (e.key && e.key.length === 1) {
      return e.key.toLowerCase();
    }
    if (e.code && e.code.startsWith('Key')) {
      return e.code.substring(3).toLowerCase();
    }
    if (e.code && e.code.startsWith('Digit')) {
      return e.code.substring(5).toLowerCase();
    }

    return e.key ? e.key.toLowerCase() : null;
  }

  const IGNORABLE_MODIFIERS = new Set([
    'Control', 'Shift', 'Alt', 'AltGraph', 'Meta', 'Super', 'Hyper',
    'Fn', 'FnLock', 'CapsLock', 'NumLock', 'ScrollLock', 'Unidentified'
  ]);

  btnRecordShortcut.addEventListener('click', () => {
    if (isRecordingShortcut) {
      stopShortcutRecording();
      return;
    }

    isRecordingShortcut = true;
    btnRecordShortcut.textContent = 'Listening... (Press Keys)';
    btnRecordShortcut.style.backgroundColor = 'var(--color-pale-green)';
    btnRecordShortcut.style.color = 'var(--color-near-black)';
    shortcutBadgeContainer.innerHTML = '<span class="key-chip" style="animation:pulse 1s infinite">Listening...</span>';

    const recordedModifiers = new Set();

    const keydownHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape key cancels recording without changes
      if (e.key === 'Escape' && recordedModifiers.size === 0) {
        stopShortcutRecording();
        renderShortcutChips();
        return;
      }

      // Track active modifiers
      if (e.ctrlKey) recordedModifiers.add('ctrl');
      if (e.shiftKey) recordedModifiers.add('shift');
      if (e.altKey) recordedModifiers.add('alt');
      if (e.metaKey) recordedModifiers.add('super');

      // Update live modifier feedback
      if (IGNORABLE_MODIFIERS.has(e.key)) {
        if (recordedModifiers.size > 0) {
          const modChips = Array.from(recordedModifiers).map(m => `<span class="key-chip">${formatKeyLabel(m)}</span>`).join('<span class="key-chip-plus">+</span>');
          shortcutBadgeContainer.innerHTML = modChips + '<span class="key-chip-plus">+</span><span class="key-chip" style="opacity:0.6">...</span>';
        }
        return;
      }

      // Non-modifier / target key pressed!
      const targetKey = normalizeKey(e);
      if (targetKey) {
        const result = Array.from(recordedModifiers);
        if (!result.includes(targetKey)) {
          result.push(targetKey);
        }
        currentShortcutKeys = result;
        if (cfgShortcutManual) {
          cfgShortcutManual.value = currentShortcutKeys.map(formatKeyLabel).join('+');
        }
        stopShortcutRecording();
        renderShortcutChips();
        showToast(`Recorded shortcut: ${currentShortcutKeys.map(formatKeyLabel).join(' + ')}`);
      }
    };

    function stopShortcutRecording() {
      isRecordingShortcut = false;
      btnRecordShortcut.textContent = 'Record Shortcut';
      btnRecordShortcut.style.backgroundColor = '';
      btnRecordShortcut.style.color = '';
      window.removeEventListener('keydown', keydownHandler, true);
    }

    window.addEventListener('keydown', keydownHandler, true);
  });

  // Manual shortcut text apply
  function applyManualShortcut() {
    if (!cfgShortcutManual) return;
    const text = cfgShortcutManual.value.trim();
    if (!text) return;

    const parts = text.split(/[+,\s]+/).map(p => p.trim().toLowerCase()).filter(Boolean);
    if (parts.length > 0) {
      currentShortcutKeys = parts;
      cfgShortcutManual.value = currentShortcutKeys.map(formatKeyLabel).join('+');
      renderShortcutChips();
      showToast(`Shortcut set to: ${currentShortcutKeys.map(formatKeyLabel).join(' + ')}`);
    }
  }

  if (btnApplyManualShortcut) {
    btnApplyManualShortcut.addEventListener('click', applyManualShortcut);
  }
  if (cfgShortcutManual) {
    cfgShortcutManual.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyManualShortcut();
      }
    });
  }

  // Preset selector
  cfgShortcutPreset.addEventListener('change', () => {
    const val = cfgShortcutPreset.value;
    if (val) {
      currentShortcutKeys = val.split('+');
      if (cfgShortcutManual) {
        cfgShortcutManual.value = currentShortcutKeys.map(formatKeyLabel).join('+');
      }
      renderShortcutChips();
      cfgShortcutPreset.value = '';
      showToast(`Selected shortcut: ${currentShortcutKeys.map(formatKeyLabel).join(' + ')}`);
    }
  });

  // ==========================================================================
  // 7. Macro Builder Controls
  // ==========================================================================
  function renderMacroSteps() {
    macroStepList.innerHTML = '';
    if (currentMacroSteps.length === 0) {
      macroStepList.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text-dim);font-size:11px;">No macro steps added. Click buttons above to add.</div>';
      return;
    }

    currentMacroSteps.forEach((st, idx) => {
      const item = document.createElement('div');
      item.className = 'macro-step-item';

      let desc = '';
      if (st.type === 'app') desc = `App: ${st.path || 'Select App'}`;
      else if (st.type === 'shortcut') desc = `Key: ${(st.keys || []).join(' + ').toUpperCase()}`;
      else if (st.type === 'delay') desc = `Wait: ${st.delayMs || 100}ms`;
      else if (st.type === 'python') desc = `Py: ${st.scriptPath ? st.scriptPath.split('/').pop() : 'script.py'}`;

      item.innerHTML = `
        <div class="step-info">
          <span class="step-number">${idx + 1}</span>
          <span class="step-desc">${escapeHtml(desc)}</span>
        </div>
        <div class="step-controls">
          <button type="button" class="btn-xs btn-move-up" data-idx="${idx}" title="Move Up" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn-xs btn-move-down" data-idx="${idx}" title="Move Down" ${idx === currentMacroSteps.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn-xs btn-del-step" data-idx="${idx}" title="Delete" style="color:var(--status-disconnected)">✕</button>
        </div>
      `;

      macroStepList.appendChild(item);
    });

    macroStepList.querySelectorAll('.btn-move-up').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.idx, 10);
        if (i > 0) {
          const temp = currentMacroSteps[i];
          currentMacroSteps[i] = currentMacroSteps[i - 1];
          currentMacroSteps[i - 1] = temp;
          renderMacroSteps();
        }
      });
    });

    macroStepList.querySelectorAll('.btn-move-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.idx, 10);
        if (i < currentMacroSteps.length - 1) {
          const temp = currentMacroSteps[i];
          currentMacroSteps[i] = currentMacroSteps[i + 1];
          currentMacroSteps[i + 1] = temp;
          renderMacroSteps();
        }
      });
    });

    macroStepList.querySelectorAll('.btn-del-step').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.idx, 10);
        currentMacroSteps.splice(i, 1);
        renderMacroSteps();
      });
    });
  }

  btnAddStepApp.addEventListener('click', async () => {
    let filePath = '';
    if (window.evoke && window.evoke.selectFile) {
      filePath = await window.evoke.selectFile('app');
    }
    currentMacroSteps.push({ type: 'app', path: filePath || 'gnome-terminal', args: '' });
    renderMacroSteps();
  });

  btnAddStepKey.addEventListener('click', () => {
    currentMacroSteps.push({ type: 'shortcut', keys: ['ctrl', 'c'] });
    renderMacroSteps();
  });

  btnAddStepDelay.addEventListener('click', () => {
    const delay = prompt('Enter delay in milliseconds:', '150');
    if (delay !== null) {
      currentMacroSteps.push({ type: 'delay', delayMs: Math.max(10, parseInt(delay, 10) || 100) });
      renderMacroSteps();
    }
  });

  // ==========================================================================
  // 8. File Pickers
  // ==========================================================================
  btnBrowseApp.addEventListener('click', async () => {
    if (window.evoke && window.evoke.selectFile) {
      const selected = await window.evoke.selectFile('app');
      if (selected) cfgAppPath.value = selected;
    }
  });

  btnBrowsePy.addEventListener('click', async () => {
    if (window.evoke && window.evoke.selectFile) {
      const selected = await window.evoke.selectFile('python');
      if (selected) cfgPyPath.value = selected;
    }
  });

  // ==========================================================================
  // 9. Save, Reset & Test Actions
  // ==========================================================================
  function gatherCurrentFormConfig() {
    const activeTabBtn = document.querySelector('#action-type-tabs .tab-btn.active');
    const actionType = activeTabBtn ? activeTabBtn.dataset.type : 'none';
    const name = cfgName.value.trim();

    let settingsPayload = {};
    if (actionType === 'app') {
      settingsPayload = { path: cfgAppPath.value.trim(), args: cfgAppArgs.value.trim() };
    } else if (actionType === 'shortcut') {
      settingsPayload = { keys: currentShortcutKeys, label: currentShortcutKeys.map(formatKeyLabel).join(' + ') };
    } else if (actionType === 'macro') {
      settingsPayload = { steps: currentMacroSteps };
    } else if (actionType === 'python') {
      settingsPayload = {
        scriptPath: cfgPyPath.value.trim(),
        args: cfgPyArgs.value.trim(),
        pythonInterpreter: cfgPyInterp.value.trim() || 'python3'
      };
    }

    return {
      name: name || (actionType === 'none' ? 'Unassigned' : 'Custom Action'),
      actionType,
      settings: settingsPayload
    };
  }

  btnSaveKey.addEventListener('click', async () => {
    const config = gatherCurrentFormConfig();
    try {
      if (window.evoke && window.evoke.saveKey) {
        const res = await window.evoke.saveKey(selectedKeyId, config);
        if (res.success) {
          showToast(`Saved mapping for ${selectedKeyId.toUpperCase()}!`);
          keymap = await window.evoke.getKeymap();
          renderKeypadGrid();
          renderMappingsTable();
          addLog('info', `Saved key ${selectedKeyId.toUpperCase()} [${config.actionType}]: "${config.name}"`);
        } else {
          showToast(`Error: ${res.error}`, true);
        }
      }
    } catch (err) {
      showToast(`Save failed: ${err.message}`, true);
    }
  });

  btnResetSingleKey.addEventListener('click', async () => {
    if (!confirm(`Reset ${selectedKeyId.toUpperCase()} to factory default?`)) return;
    try {
      if (window.evoke && window.evoke.resetKey) {
        const res = await window.evoke.resetKey(selectedKeyId);
        if (res.success) {
          showToast(`Reset ${selectedKeyId.toUpperCase()} to default.`);
          keymap = await window.evoke.getKeymap();
          renderKeypadGrid();
          renderMappingsTable();
          selectKey(selectedKeyId);
        }
      }
    } catch (err) {
      showToast(`Reset error: ${err.message}`, true);
    }
  });

  btnClearMapping.addEventListener('click', async () => {
    switchActionTypeTab('none');
    cfgName.value = 'Unassigned';
    const config = { name: 'Unassigned', actionType: 'none', settings: {} };
    if (window.evoke && window.evoke.saveKey) {
      await window.evoke.saveKey(selectedKeyId, config);
      keymap = await window.evoke.getKeymap();
      renderKeypadGrid();
      renderMappingsTable();
      showToast(`Cleared mapping for ${selectedKeyId.toUpperCase()}.`);
    }
  });

  btnTestAction.addEventListener('click', async () => {
    const config = gatherCurrentFormConfig();
    const currentKey = keymap.find(k => k.id === selectedKeyId) || {};
    const fullTestPayload = {
      ...currentKey,
      ...config
    };

    btnTestAction.disabled = true;
    btnTestAction.textContent = 'Executing...';

    try {
      if (window.evoke && window.evoke.testAction) {
        const res = await window.evoke.testAction(fullTestPayload);
        displayTestResult(res);
      }
    } catch (err) {
      displayTestResult({ success: false, error: err.message, durationMs: 0 });
    } finally {
      btnTestAction.disabled = false;
      btnTestAction.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Test Action</span>
      `;
    }
  });

  function displayTestResult(res) {
    testResultBox.style.display = 'flex';
    testResultBadge.className = `result-status-badge ${res.success ? 'success' : 'error'}`;
    testResultBadge.textContent = res.success ? 'SUCCESS' : 'FAILED';
    testResultTime.textContent = `${res.durationMs || 0}ms`;

    let text = res.message || '';
    if (res.output) text = res.output;
    if (res.error) text += (text ? '\nError: ' : '') + res.error;
    testResultOutput.textContent = text || (res.success ? 'Executed with no output.' : 'Execution failed.');
  }

  // ==========================================================================
  // 10. All Mappings Table View
  // ==========================================================================
  function renderMappingsTable() {
    mappingsTableBody.innerHTML = '';
    keymap.forEach(k => {
      const tr = document.createElement('tr');
      const isConfigured = k.actionType !== 'none';
      let detail = '—';
      if (k.actionType === 'app') detail = `${k.settings.path || ''} ${k.settings.args || ''}`.trim();
      else if (k.actionType === 'shortcut') detail = (k.settings.keys || []).join(' + ').toUpperCase();
      else if (k.actionType === 'macro') detail = `${(k.settings.steps || []).length} steps`;
      else if (k.actionType === 'python') detail = (k.settings.scriptPath || '').split('/').pop();

      tr.innerHTML = `
        <td><strong style="color:var(--color-pale-green)">${k.id.toUpperCase()}</strong></td>
        <td><code>Key '${k.keyLabel}' (R${k.row}C${k.col})</code></td>
        <td><strong>${escapeHtml(k.name || 'Unassigned')}</strong></td>
        <td><span class="tile-type-badge"><span class="dot ${k.actionType}"></span> ${getActionTypeDisplay(k.actionType)}</span></td>
        <td style="color:var(--text-muted);font-family:monospace;font-size:12px;">${escapeHtml(detail)}</td>
        <td>
          <button class="btn-xs btn-edit-table" data-id="${k.id}">Configure</button>
          <button class="btn-xs btn-test-table" data-id="${k.id}">Test</button>
        </td>
      `;

      mappingsTableBody.appendChild(tr);
    });

    mappingsTableBody.querySelectorAll('.btn-edit-table').forEach(b => {
      b.addEventListener('click', () => {
        selectKey(b.dataset.id);
        switchTab('dashboard');
      });
    });

    mappingsTableBody.querySelectorAll('.btn-test-table').forEach(b => {
      b.addEventListener('click', async () => {
        const k = keymap.find(item => item.id === b.dataset.id);
        if (k && window.evoke && window.evoke.testAction) {
          const res = await window.evoke.testAction(k);
          showToast(`Test ${k.id.toUpperCase()}: ${res.success ? 'Success' : res.error}`, !res.success);
        }
      });
    });
  }

  btnExportKeymap.addEventListener('click', async () => {
    if (window.evoke && window.evoke.exportKeymap) {
      const res = await window.evoke.exportKeymap();
      if (res.success) {
        showToast(`Exported keymap to ${res.path.split('/').pop()}`);
        addLog('info', `Exported keymap to ${res.path}`);
      }
    }
  });

  btnImportKeymap.addEventListener('click', async () => {
    if (window.evoke && window.evoke.importKeymap) {
      const res = await window.evoke.importKeymap();
      if (res.success) {
        keymap = res.keymap;
        renderKeypadGrid();
        renderMappingsTable();
        selectKey(selectedKeyId);
        showToast('Keymap imported successfully!');
        addLog('info', 'Imported keymap from file.');
      } else if (!res.canceled) {
        showToast(`Import failed: ${res.error}`, true);
      }
    }
  });

  btnResetAllKeys.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset ALL 16 keys to factory default mappings?')) return;
    if (window.evoke && window.evoke.resetAllKeys) {
      const res = await window.evoke.resetAllKeys();
      if (res.success) {
        keymap = res.keymap;
        renderKeypadGrid();
        renderMappingsTable();
        selectKey(selectedKeyId);
        showToast('All 16 keys reset to defaults.');
      }
    }
  });

  // ==========================================================================
  // 11. Settings View Controls
  // ==========================================================================
  btnSaveMac.addEventListener('click', async () => {
    const mac = setTargetMac.value.trim();
    if (!mac) return;
    if (window.evoke && window.evoke.reconnectBluetooth) {
      await window.evoke.reconnectBluetooth(mac);
      sidebarMacText.textContent = mac;
      showToast(`Initiating connection to ${mac}...`);
      addLog('info', `Connecting to configured MAC: ${mac}`);
    }
  });

  btnSaveGeneralSettings.addEventListener('click', async () => {
    const updated = {
      theme: setThemeSelect.value,
      debounceMs: parseInt(setDebounce.value, 10) || 250,
      autoConnect: setAutoconnect.checked,
      simulationMode: setSimulation.checked,
      pythonInterpreter: setPythonBin.value.trim() || 'python3'
    };

    if (window.evoke && window.evoke.saveSettings) {
      await window.evoke.saveSettings(updated);
      settings = { ...settings, ...updated };
      applySettingsToUI();
      showToast('Settings saved!');
      addLog('info', 'User settings updated.');
    }
  });

  setThemeSelect.addEventListener('change', () => {
    const theme = setThemeSelect.value;
    document.documentElement.setAttribute('data-theme', theme);
  });

  // ==========================================================================
  // 12. Hardware Telemetry & Bluetooth Controls
  // ==========================================================================
  btnClearBuffer.addEventListener('click', async () => {
    if (window.evoke && window.evoke.clearBuffer) {
      await window.evoke.clearBuffer();
      telemetryActiveKey.textContent = '—';
      telemetryBuffer.textContent = '(empty)';
      showToast('Keypad buffer cleared.');
      addLog('info', 'Sent CLEAR command to ESP32.');
    }
  });

  btnReconnectQuick.addEventListener('click', async () => {
    btnReconnectQuick.style.transform = 'rotate(180deg)';
    setTimeout(() => { btnReconnectQuick.style.transform = ''; }, 300);
    if (window.evoke && window.evoke.reconnectBluetooth) {
      await window.evoke.reconnectBluetooth();
      showToast('Reconnection requested.');
    }
  });

  function updateBluetoothUI(status) {
    if (!status) return;

    const state = status.state || (status.connected ? 'connected' : 'disconnected');
    const isConn = !!status.connected;

    // Sidebar
    sidebarStatusDot.className = `status-dot ${state}`;
    sidebarStatusText.textContent = capitalize(state);
    if (status.mac) {
      sidebarMacText.textContent = status.mac;
      setTargetMac.value = status.mac;
    }

    // Topbar badge
    connectionBadge.className = `connection-badge ${state}`;
    badgeStatusText.textContent = isConn ? `Connected (${status.device_name || 'ESP32'})` : capitalize(state);
  }

  function triggerPhysicalKeyFeedback(physKeyChar) {
    playKeyBeep();

    // Flash matching tile in matrix grid
    const targetTile = Array.from(document.querySelectorAll('.key-tile')).find(t => t.dataset.physKey === String(physKeyChar));
    if (targetTile) {
      targetTile.classList.remove('key-active-flash');
      void targetTile.offsetWidth; // trigger reflow
      targetTile.classList.add('key-active-flash');
    }
  }

  // ==========================================================================
  // 13. Subscriptions to Main Process Events
  // ==========================================================================
  function setupEventListeners() {
    if (!window.evoke) return;

    // Incoming Key Event from ESP32
    window.evoke.onKeyEvent((msg) => {
      telemetryActiveKey.textContent = msg.key || '—';
      telemetryBuffer.textContent = msg.buffer || '(empty)';

      triggerPhysicalKeyFeedback(msg.key);
      addLog('info', `Key Received: [${msg.key}] | Buffer: "${msg.buffer}" | Total: ${msg.count}`);
    });

    // Bluetooth Status Change
    window.evoke.onBluetoothStatus((status) => {
      updateBluetoothUI(status);
      addLog('info', `Bluetooth Status: ${status.state.toUpperCase()} ${status.mac ? '(' + status.mac + ')' : ''}`);
    });

    // Action Execution Result
    window.evoke.onActionExecuted((result) => {
      if (result.debounced) return;
      if (result.actionType === 'none') return;

      const title = result.name || result.keyId.toUpperCase();
      if (result.success) {
        showToast(`Key ${result.keyId.toUpperCase()} Triggered: ${title}`);
        addLog('info', `Action Executed [${result.actionType}]: "${title}" (${result.durationMs}ms)`);
      } else {
        showToast(`Action Error (${title}): ${result.error}`, true);
        addLog('error', `Action Error [${result.actionType}]: ${result.error}`);
      }
    });

    // Bridge / Main Logs
    window.evoke.onLog((entry) => {
      addLog(entry.level || 'info', entry.message);
    });
  }

  // ==========================================================================
  // 14. Diagnostics Log & Toast Helpers
  // ==========================================================================
  function addLog(level, message) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    const timeStr = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="log-time">[${timeStr}]</span> <span>${escapeHtml(message)}</span>`;
    logStream.appendChild(entry);
    logStream.scrollTop = logStream.scrollHeight;
  }

  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    logStream.innerHTML = '';
    addLog('info', 'Logs cleared.');
  });

  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Start app
  init();
});
