const assert = require('assert');
const path = require('path');
const ActionExecutor = require('../src/main/action_executor');

console.log('=== Running Action Executor Tests ===');

async function runTests() {
  const executor = new ActionExecutor({ debounceMs: 200 });

  // 1. Test Application Launch (echo command)
  const appConfig = {
    id: 'k1',
    keyLabel: '1',
    name: 'Test App',
    actionType: 'app',
    settings: { path: 'echo', args: 'Hello EVOKE' }
  };
  const appRes = await executor.executeKey(appConfig, 'test');
  assert.strictEqual(appRes.success, true);
  assert(appRes.message.includes('Launched: echo'), 'App launcher should report launched command');
  console.log('✔ Launch Application execution');

  // 2. Test Python Script Execution with Output Capture
  const scriptPath = path.resolve(__dirname, '../scripts/system_status.py');
  const pythonConfig = {
    id: 'k4',
    keyLabel: 'A',
    name: 'System Status',
    actionType: 'python',
    settings: {
      scriptPath,
      pythonInterpreter: executor.defaultPython,
      args: '--summary'
    }
  };
  const pyRes = await executor.executeKey(pythonConfig, 'test');
  assert.strictEqual(pyRes.success, true);
  assert.strictEqual(pyRes.exitCode, 0);
  assert(pyRes.output.includes('EVOKE SYSTEM STATUS'), 'Python runner should capture script stdout');
  console.log('✔ Python Script execution and stdout capture');

  // 3. Test Python Script Failure Handling
  const badPyConfig = {
    id: 'k5',
    keyLabel: '4',
    name: 'Nonexistent Script',
    actionType: 'python',
    settings: { scriptPath: '/tmp/nonexistent_script_12345.py' }
  };
  const badPyRes = await executor.executeKey(badPyConfig, 'test');
  assert.strictEqual(badPyRes.success, false);
  assert(badPyRes.error.includes('Script file not found'), 'Should report missing file error');
  console.log('✔ Python Script failure and error reporting');

  // 4. Test Macro Execution (Sequential with Delay)
  const macroConfig = {
    id: 'k8',
    keyLabel: 'B',
    name: 'Test Macro',
    actionType: 'macro',
    settings: {
      steps: [
        { type: 'delay', delayMs: 60 },
        {
          type: 'python',
          scriptPath,
          pythonInterpreter: executor.defaultPython,
          args: '--summary'
        }
      ]
    }
  };
  const macroRes = await executor.executeKey(macroConfig, 'test');
  assert.strictEqual(macroRes.success, true);
  assert.strictEqual(macroRes.steps.length, 2);
  assert.strictEqual(macroRes.steps[0].type, 'delay');
  assert.strictEqual(macroRes.steps[1].type, 'python');
  assert(macroRes.durationMs >= 50, 'Duration should reflect delay');
  console.log('✔ Macro sequential step execution with delays');

  // 5. Test Debounce Protection
  const debounceKey = { id: 'k2', keyLabel: '2', name: 'Rapid Key', actionType: 'none', settings: {} };
  const firstPress = await executor.executeKey(debounceKey, 'hardware');
  assert.strictEqual(firstPress.success, true);

  const rapidPress = await executor.executeKey(debounceKey, 'hardware');
  assert.strictEqual(rapidPress.debounced, true, 'Subsequent rapid keypress must be debounced');
  console.log('✔ Debounce protection blocks duplicate triggers');

  // 6. Test No Action Key
  const noneKey = { id: 'k15', keyLabel: '#', name: 'Unassigned', actionType: 'none', settings: {} };
  const noneRes = await executor.executeKey(noneKey, 'test');
  assert.strictEqual(noneRes.success, true);
  assert(noneRes.message.includes('no assigned action'));
  console.log('✔ Unassigned key handled as safe no-op');

  console.log('\nAll Action Executor tests passed successfully! [6/6]\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
