const { spawn } = require('child_process');
const path = require('path');

console.log('=== Running Electron Headless Smoke Test ===');

const electronBin = path.resolve(__dirname, '../node_modules/.bin/electron');
const mainPath = path.resolve(__dirname, '../src/main/index.js');

// Launch electron with --no-sandbox
const child = spawn(electronBin, ['--no-sandbox', mainPath], {
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', d => { output += d.toString(); });
child.stderr.on('data', d => { output += d.toString(); });

const timer = setTimeout(() => {
  console.log('✔ Electron started successfully and ran without crash');
  child.kill('SIGTERM');
  process.exit(0);
}, 3000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  if (signal === 'SIGTERM') {
    // Expected termination after successful startup
    process.exit(0);
  } else {
    console.error(`Electron exited prematurely with code ${code}`);
    console.error(output);
    process.exit(code || 1);
  }
});
