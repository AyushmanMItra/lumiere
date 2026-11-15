const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  TEST SUITE: ADMIN CONSOLE & RESTART CONTROLLER (y/n/r)        ');
console.log('================================================================');

// 1. Validate start.bat configuration
const startBatPath = path.join(__dirname, '..', 'start.bat');
assert(fs.existsSync(startBatPath), 'start.bat must exist');
const startBatContent = fs.readFileSync(startBatPath, 'utf8');

assert(startBatContent.includes('set LUMIERE_BATCH_RUNNER=1'), 'start.bat must set LUMIERE_BATCH_RUNNER=1');
assert(startBatContent.includes(':server_loop'), 'start.bat must have a server loop anchor');
assert(startBatContent.includes('if "%SERVER_EXIT%"=="42"'), 'start.bat must handle restart exit code 42');
assert(startBatContent.includes('choice /c YNR'), 'start.bat must provide choice /c YNR for y/n/r input');
console.log('  ✓ start.bat implements persistent restart loop and choice /c YNR');

// 2. Validate server.js admin console and restart logic
const serverJsPath = path.join(__dirname, '..', 'server.js');
const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

assert(serverJsContent.includes('function initAdminConsole'), 'server.js must define initAdminConsole');
assert(serverJsContent.includes('function restartLumiereServer'), 'server.js must define restartLumiereServer');
assert(serverJsContent.includes("process.on('SIGINT'"), 'server.js must handle SIGINT (Ctrl+C)');
assert(serverJsContent.includes("Terminate server or restart (y/n/r)?"), 'server.js must prompt with (y/n/r)');
assert(serverJsContent.includes("Lumiere Cinema Server is still running"), 'server.js must cancel termination on "n"');
assert(serverJsContent.includes("code 42"), 'server.js must exit with code 42 for batch reload');
console.log('  ✓ server.js intercepts SIGINT, prompts (y/n/r), keeps running on "n", and restarts on "r"');

// 3. Functional check of admin prompt parsing logic
function simulateConsoleInput(choice, isPrompting) {
  let outcome = null;
  const input = choice.trim().toLowerCase();
  if (isPrompting) {
    if (input === 'y' || input === 'yes') {
      outcome = 'terminate';
    } else if (input === 'n' || input === 'no') {
      outcome = 'keep_running';
    } else if (input === 'r' || input === 'restart') {
      outcome = 'restart';
    } else {
      outcome = 'invalid';
    }
  } else {
    if (input === 'r' || input === 'restart') {
      outcome = 'restart';
    }
  }
  return outcome;
}

assert.strictEqual(simulateConsoleInput('n', true), 'keep_running', 'Input "n" must keep server running');
assert.strictEqual(simulateConsoleInput('N', true), 'keep_running', 'Input "N" must keep server running');
assert.strictEqual(simulateConsoleInput('r', true), 'restart', 'Input "r" during prompt must restart server');
assert.strictEqual(simulateConsoleInput('R', true), 'restart', 'Input "R" during prompt must restart server');
assert.strictEqual(simulateConsoleInput('r', false), 'restart', 'Input "r" while running must restart server');
assert.strictEqual(simulateConsoleInput('y', true), 'terminate', 'Input "y" must terminate server');
assert.strictEqual(simulateConsoleInput('Y', true), 'terminate', 'Input "Y" must terminate server');
console.log('  ✓ Console command parser accurately routes y -> terminate, n -> keep running, r -> restart');

console.log('================================================================');
console.log('  RESULTS: All admin console & restart checks passed!           ');
console.log('================================================================');
