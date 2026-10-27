const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ConfigStore = require('../src/main/config_store');

console.log('=== Running Keymap Store Tests ===');

const testConfigDir = path.resolve(__dirname, 'temp_config');
const testConfigPath = path.join(testConfigDir, 'test_keymap.json');

// Cleanup any previous test artifacts
if (fs.existsSync(testConfigDir)) {
  fs.rmSync(testConfigDir, { recursive: true, force: true });
}

// 1. Test initialization with default 16 keys
const store = new ConfigStore(testConfigPath);
assert.strictEqual(store.keymap.length, 16, 'Keymap must contain exactly 16 keys');
console.log('✔ Initialized 16-key matrix layout');

// 2. Verify all keys have valid rows (1-4), cols (1-4), and physical keyLabels
const expectedKeys = ['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D'];
for (let i = 0; i < 16; i++) {
  const k = store.keymap[i];
  assert.strictEqual(k.id, `k${i+1}`, `Key id should be k${i+1}`);
  assert.strictEqual(k.keyLabel, expectedKeys[i], `Physical key label for k${i+1} should match firmware layout`);
  assert(k.row >= 1 && k.row <= 4, 'Row must be between 1 and 4');
  assert(k.col >= 1 && k.col <= 4, 'Col must be between 1 and 4');
}
console.log('✔ Physical matrix rows and columns verified for all 16 keys');

// 3. Test updating a key (e.g. k1 to custom app launch)
const updateRes = store.updateKey('k1', {
  name: 'Open Editor',
  actionType: 'app',
  settings: { path: '/usr/bin/nano', args: 'notes.txt' }
});
assert.strictEqual(updateRes.success, true);
assert.strictEqual(updateRes.key.name, 'Open Editor');
assert.strictEqual(updateRes.key.actionType, 'app');
assert.strictEqual(updateRes.key.settings.path, '/usr/bin/nano');
console.log('✔ Updating key configuration and in-memory state');

// 4. Verify persistence to disk
const loadedStore = new ConfigStore(testConfigPath);
const k1Loaded = loadedStore.getKey('k1');
assert.strictEqual(k1Loaded.name, 'Open Editor');
assert.strictEqual(k1Loaded.settings.path, '/usr/bin/nano');
console.log('✔ Keymap persists across store reload');

// 5. Test resetting a single key
const resetRes = loadedStore.resetKey('k1');
assert.strictEqual(resetRes.success, true);
assert.strictEqual(resetRes.key.name, 'Launch Terminal');
console.log('✔ Resetting single key to default');

// 6. Test Export and Import
const exportPath = path.join(testConfigDir, 'exported_keymap.json');
const exportRes = loadedStore.exportKeymap(exportPath);
assert.strictEqual(exportRes.success, true);
assert(fs.existsSync(exportPath), 'Exported file must exist');

// Modify a key in store, then re-import exported file
loadedStore.updateKey('k2', { name: 'Temporary Name', actionType: 'none', settings: {} });
const importRes = loadedStore.importKeymap(exportPath);
assert.strictEqual(importRes.success, true);
assert.strictEqual(loadedStore.getKey('k2').name, 'Copy', 'Import should restore previous state');
console.log('✔ Export and Import JSON keymap validation');

// 7. Test invalid import format rejection
const invalidPath = path.join(testConfigDir, 'invalid.json');
fs.writeFileSync(invalidPath, JSON.stringify({ keymap: [1, 2, 3] }));
const failImport = loadedStore.importKeymap(invalidPath);
assert.strictEqual(failImport.success, false, 'Should reject invalid key count');
console.log('✔ Schema validation rejects corrupted keymaps');

// 8. Test Settings save and load
const settingsRes = loadedStore.saveSettings({ theme: 'light', debounceMs: 300 });
assert.strictEqual(settingsRes.success, true);
assert.strictEqual(loadedStore.settings.theme, 'light');
assert.strictEqual(loadedStore.settings.debounceMs, 300);
console.log('✔ User settings persistence verified');

// Clean up
fs.rmSync(testConfigDir, { recursive: true, force: true });
console.log('\nAll Keymap Store tests passed successfully! [8/8]\n');
