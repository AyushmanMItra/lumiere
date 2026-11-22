/**
 * TEST SUITE: Live Reactions Menu Default State & Interactivity CDP Verification
 * 
 * Verifies that:
 * 1. #dockReactionsTray is closed/hidden by default upon entering room UI.
 * 2. Clicking #dockReactionsBtn opens #dockReactionsTray (display: flex).
 * 3. Clicking #dockReactionsBtn again closes it (display: none).
 * 4. Clicking outside the menu closes it.
 * 5. Selecting a reaction item closes it.
 * 
 * Strict No-Emoji Policy: Uses [PASS], [FAIL], [INFO] textual tags.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const wsPkg = require('ws');

const PORT = 8198;
const CDP_PORT = 9452;
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const filePath = path.join(PUBLIC_DIR, reqPath);
      
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[INFO] Static test server running at http://127.0.0.1:${PORT}/`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

function launchEdge() {
  const tmpDir = path.join(os.tmpdir(), 'edge-reactions-vis-' + Date.now());
  const proc = spawn(EDGE_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=' + CDP_PORT,
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=' + tmpDir,
    '--no-first-run',
    '--no-default-browser-check',
    `http://127.0.0.1:${PORT}/`
  ]);

  return new Promise((resolve, reject) => {
    let started = false;
    const check = () => {
      http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, res => {
        if (res.statusCode === 200) {
          started = true;
          resolve({ proc, tmpDir });
        } else {
          setTimeout(check, 100);
        }
      }).on('error', () => {
        setTimeout(check, 100);
      });
    };
    setTimeout(check, 200);
    setTimeout(() => {
      if (!started) reject(new Error('Edge CDP launch timeout'));
    }, 10000);
  });
}

function getPageWSUrl() {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const poll = () => {
      http.get(`http://127.0.0.1:${CDP_PORT}/json`, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const list = JSON.parse(body);
            const page = list.find(t => t.type === 'page' && t.url && t.url.includes(String(PORT)));
            if (page && page.webSocketDebuggerUrl) {
              resolve(page.webSocketDebuggerUrl);
            } else if (Date.now() - startTime < 10000) {
              setTimeout(poll, 150);
            } else {
              reject(new Error('Target page with PORT not found'));
            }
          } catch (e) {
            if (Date.now() - startTime < 10000) setTimeout(poll, 150);
            else reject(e);
          }
        });
      }).on('error', err => {
        if (Date.now() - startTime < 10000) setTimeout(poll, 150);
        else reject(err);
      });
    };
    poll();
  });
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    ws.onmessage = msg => {
      const data = JSON.parse(msg.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: LIVE REACTIONS TRAY DEFAULT VISIBILITY CDP VERIFICATION');
  console.log('========================================================================\n');

  let server;
  let edgeInfo;
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedCount++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failedCount++;
    }
  }

  try {
    server = await startStaticServer();
    edgeInfo = await launchEdge();
    const wsUrl = await getPageWSUrl();
    const ws = new wsPkg(wsUrl);
    await new Promise(res => { ws.onopen = res; });
    const cdp = new CDPClient(ws);

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');
    for (let i = 0; i < 50; i++) {
      const ready = await cdp.eval('document.readyState === "complete"');
      if (ready) break;
      await sleep(100);
    }
    await sleep(200);

    // 1. Enter room UI cleanly (simulating room join)
    await cdp.eval(`(() => {
      const landing = document.getElementById('joinModal') || document.querySelector('.landing-page-wrapper');
      const appContainer = document.getElementById('appContainer');
      const theater = document.getElementById('theaterArea');
      const hud = document.getElementById('cinemaControls');
      const stage = document.getElementById('stagePlaceholder');
      const dock = document.getElementById('dockWrapper');

      if (landing) landing.classList.add('hidden');
      if (appContainer) appContainer.classList.remove('hidden');
      if (theater) theater.classList.remove('hidden');
      if (hud) hud.classList.remove('hidden');
      if (stage) stage.classList.remove('hidden');
      if (dock) dock.classList.remove('hidden');
    })()`);

    // TEST 1: Default state - dock reactions tray MUST be hidden
    const defaultState = await cdp.eval(`(() => {
      const tray = document.getElementById('dockReactionsTray');
      if (!tray) return { exists: false };
      const style = window.getComputedStyle(tray);
      const isHiddenClass = tray.classList.contains('hidden');
      const isDisplayNone = style.display === 'none';
      const rect = tray.getBoundingClientRect();
      const isVisibleOnScreen = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      return {
        exists: true,
        isHiddenClass,
        isDisplayNone,
        display: style.display,
        isVisibleOnScreen
      };
    })()`);

    assert(defaultState.exists, 'Reactions tray element #dockReactionsTray exists in DOM');
    assert(defaultState.isHiddenClass, 'Reactions tray has "hidden" class by default on room entry');
    assert(defaultState.isDisplayNone, `Reactions tray computed style display is "none" by default (got: ${defaultState.display})`);
    assert(!defaultState.isVisibleOnScreen, 'Reactions tray is NOT visible on screen when user has not clicked the button');

    // TEST 2: Click #dockReactionsBtn to open tray
    await cdp.eval(`(() => {
      const btn = document.getElementById('dockReactionsBtn');
      if (btn) btn.click();
    })()`);
    await sleep(100);

    const openedState = await cdp.eval(`(() => {
      const tray = document.getElementById('dockReactionsTray');
      const btn = document.getElementById('dockReactionsBtn');
      const style = window.getComputedStyle(tray);
      const rect = tray.getBoundingClientRect();
      return {
        isHiddenClass: tray.classList.contains('hidden'),
        isDisplayFlex: style.display === 'flex',
        display: style.display,
        isVisibleOnScreen: rect.width > 0 && rect.height > 0 && style.display !== 'none',
        hasActiveRing: btn.classList.contains('active-status-ring')
      };
    })()`);

    assert(!openedState.isHiddenClass, 'Clicking reactions button removes "hidden" class');
    assert(openedState.isDisplayFlex, `Clicking reactions button sets computed style display to "flex" (got: ${openedState.display})`);
    assert(openedState.isVisibleOnScreen, 'Reactions tray is now visible on screen after button click');
    assert(openedState.hasActiveRing, 'Reactions button has active ring indicator');

    // TEST 3: Click #dockReactionsBtn again to toggle closed
    await cdp.eval(`(() => {
      const btn = document.getElementById('dockReactionsBtn');
      if (btn) btn.click();
    })()`);
    await sleep(100);

    const toggledClosedState = await cdp.eval(`(() => {
      const tray = document.getElementById('dockReactionsTray');
      const btn = document.getElementById('dockReactionsBtn');
      const style = window.getComputedStyle(tray);
      const rect = tray.getBoundingClientRect();
      return {
        isHiddenClass: tray.classList.contains('hidden'),
        isDisplayNone: style.display === 'none',
        display: style.display,
        isVisibleOnScreen: rect.width > 0 && rect.height > 0 && style.display !== 'none',
        hasActiveRing: btn.classList.contains('active-status-ring')
      };
    })()`);

    assert(toggledClosedState.isHiddenClass, 'Clicking reactions button again re-adds "hidden" class');
    assert(toggledClosedState.isDisplayNone, `Clicking reactions button again resets computed style display to "none" (got: ${toggledClosedState.display})`);
    assert(!toggledClosedState.isVisibleOnScreen, 'Reactions tray is hidden after toggle close');
    assert(!toggledClosedState.hasActiveRing, 'Active ring removed from reactions button');

    // TEST 4: Click outside dismisses tray
    // First open it again
    await cdp.eval(`(() => {
      const btn = document.getElementById('dockReactionsBtn');
      if (btn) btn.click();
    })()`);
    await sleep(50);

    // Now click on stage placeholder (outside tap)
    await cdp.eval(`(() => {
      const stage = document.getElementById('stagePlaceholder');
      if (stage) stage.click();
      else document.body.click();
    })()`);
    await sleep(250); // wait for dismiss animation

    const outsideClosedState = await cdp.eval(`(() => {
      const tray = document.getElementById('dockReactionsTray');
      const style = window.getComputedStyle(tray);
      return {
        isHiddenClass: tray.classList.contains('hidden'),
        isDisplayNone: style.display === 'none',
        display: style.display
      };
    })()`);

    assert(outsideClosedState.isHiddenClass, 'Clicking outside tray adds "hidden" class');
    assert(outsideClosedState.isDisplayNone, `Clicking outside resets computed style display to "none" (got: ${outsideClosedState.display})`);

    // TEST 5: Clicking a reaction item dismisses tray
    // Open tray
    await cdp.eval(`(() => {
      const btn = document.getElementById('dockReactionsBtn');
      if (btn) btn.click();
    })()`);
    await sleep(50);

    // Click first reaction item (Heart)
    await cdp.eval(`(() => {
      const firstItem = document.querySelector('#dockReactionsTray .dock-reaction-item');
      if (firstItem) firstItem.click();
    })()`);
    await sleep(100);

    const reactionItemClosedState = await cdp.eval(`(() => {
      const tray = document.getElementById('dockReactionsTray');
      const style = window.getComputedStyle(tray);
      return {
        isHiddenClass: tray.classList.contains('hidden'),
        isDisplayNone: style.display === 'none',
        display: style.display
      };
    })()`);

    assert(reactionItemClosedState.isHiddenClass, 'Selecting reaction adds "hidden" class to tray');
    assert(reactionItemClosedState.isDisplayNone, `Selecting reaction resets computed style display to "none" (got: ${reactionItemClosedState.display})`);

    console.log('\n========================================================================');
    console.log(`  SUMMARY: ${passedCount} CHECKS PASSED, ${failedCount} FAILED`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('[ERROR] Test run aborted with exception:', err);
  } finally {
    if (edgeInfo && edgeInfo.proc) {
      try {
        process.kill(edgeInfo.proc.pid);
        fs.rmSync(edgeInfo.tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
    if (server) {
      server.close();
    }
    process.exit(failedCount === 0 ? 0 : 1);
  }
}

runTests();
