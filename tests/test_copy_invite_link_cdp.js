/**
 * TEST SUITE: Copy Invite Link Icon Mobile & Tablet CDP Verification
 * 
 * Verifies that:
 * 1. #dockInviteBtn is visible with non-zero dimensions across all mobile, tablet, and landscape viewports.
 * 2. #dockInviteBtn meets the 44px minimum touch target requirement (width >= 44px, height >= 44px).
 * 3. #dockInviteBtn has proper computed display, visibility, opacity, and z-index priority.
 * 4. #dockInviteBtn does NOT overlap any buttons in .floating-pill-dock.
 * 5. Clicking/tapping #dockInviteBtn triggers link copying and displays confirmation toast.
 * 
 * Strict No-Emoji Policy: Uses [PASS], [FAIL], [INFO] textual tags.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const wsPkg = require('ws');

const PORT = 8230;
const CDP_PORT = 9475;
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

function startServer() {
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
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
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
  const tmpDir = path.join(os.tmpdir(), 'edge-invite-test-' + Date.now());
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
      if (!started) reject(new Error('Edge launch timeout'));
    }, 10000);
  });
}

function getPageWSUrl() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}/json`, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const list = JSON.parse(body);
          const page = list.find(t => t.type === 'page' && t.url && t.url.includes(String(PORT))) || list.find(t => t.type === 'page');
          if (page && page.webSocketDebuggerUrl) {
            resolve(page.webSocketDebuggerUrl);
          } else {
            reject(new Error('No page target found'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
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

const TEST_VIEWPORTS = [
  // Phones - Portrait
  { name: 'Ultra-Narrow Phone (320x568)', w: 320, h: 568, dpr: 2.0, mobile: true, type: 'Ultra-Narrow Phone' },
  { name: 'Galaxy Z Fold Cover (344x882)', w: 344, h: 882, dpr: 2.625, mobile: true, type: 'Ultra-Narrow Phone' },
  { name: 'Moto G4 (360x640)', w: 360, h: 640, dpr: 3.0, mobile: true, type: 'Compact Phone' },
  { name: 'iPhone SE (375x667)', w: 375, h: 667, dpr: 2.0, mobile: true, type: 'Compact Phone' },
  { name: 'iPhone 14 / 15 / 16 (393x852)', w: 393, h: 852, dpr: 3.0, mobile: true, type: 'Flagship Phone' },
  { name: 'Pixel 8 (412x892)', w: 412, h: 892, dpr: 2.625, mobile: true, type: 'Flagship Phone' },
  { name: 'iPhone 16 Pro Max (430x932)', w: 430, h: 932, dpr: 3.0, mobile: true, type: 'Large Phone' },
  { name: 'Mobile Boundary (500x800)', w: 500, h: 800, dpr: 2.0, mobile: true, type: 'Mobile Upper Boundary' },
  
  // Foldables & Tablets - Portrait
  { name: 'Tablet Boundary (501x800)', w: 501, h: 800, dpr: 2.0, mobile: true, type: 'Tablet Lower Boundary' },
  { name: 'Surface Duo (540x720)', w: 540, h: 720, dpr: 2.5, mobile: true, type: 'Foldable Device' },
  { name: 'Galaxy Tab S6 Lite (600x960)', w: 600, h: 960, dpr: 1.33, mobile: true, type: 'Small Tablet' },
  { name: 'iPad Mini (768x1024)', w: 768, h: 1024, dpr: 2.0, mobile: true, type: 'Midsize Tablet' },
  { name: 'iPad Pro 13 (1024x1366)', w: 1024, h: 1366, dpr: 2.0, mobile: true, type: 'Large Tablet' },
  
  // Landscape - Mobile & Tablet
  { name: 'iPhone 15 Landscape (852x393)', w: 852, h: 393, dpr: 3.0, mobile: true, type: 'Mobile Landscape' },
  { name: 'Pixel 8 Landscape (892x412)', w: 892, h: 412, dpr: 2.625, mobile: true, type: 'Mobile Landscape' },
  { name: 'iPhone 16 Pro Max Landscape (932x430)', w: 932, h: 430, dpr: 3.0, mobile: true, type: 'Large Mobile Landscape' },
  { name: 'Galaxy Tab Landscape (960x600)', w: 960, h: 600, dpr: 1.33, mobile: true, type: 'Short Tablet Landscape' },
  { name: 'iPad Mini Landscape (1024x768)', w: 1024, h: 768, dpr: 2.0, mobile: true, type: 'Tablet Landscape' },
  
  // Desktop
  { name: 'Desktop Full HD (1920x1080)', w: 1920, h: 1080, dpr: 1.0, mobile: false, type: 'Desktop' }
];

async function runTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: COPY INVITE LINK ICON MOBILE & TABLET CDP VERIFICATION');
  console.log('========================================================================\n');

  let server;
  let edgeInfo;
  let ws;
  let passedCount = 0;
  let failedCount = 0;
  const failureLog = [];

  function assert(condition, testName, details = '') {
    if (condition) {
      passedCount++;
      console.log(`  [PASS] ${testName}`);
    } else {
      failedCount++;
      const msg = `[FAIL] ${testName} ${details ? '(' + details + ')' : ''}`;
      console.error(`  ${msg}`);
      failureLog.push(msg);
    }
  }

  try {
    server = await startServer();
    edgeInfo = await launchEdge();
    const wsUrl = await getPageWSUrl();
    ws = new wsPkg(wsUrl);
    await new Promise(res => { ws.onopen = res; });
    const cdp = new CDPClient(ws);

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');

    // Wait for document ready
    for (let i = 0; i < 50; i++) {
      const ready = await cdp.eval('document.readyState === "complete" && !!document.getElementById("appContainer")');
      if (ready) break;
      await sleep(100);
    }
    await sleep(200);

    // Initialize theater room state
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

      document.body.classList.add('in-room');
      
      // Set test room state if not already initialized
      if (window.state) {
        window.state.roomId = 'TEST-INVITE-ROOM';
        window.state.inRoom = true;
      }
    })()`);

    console.log('[INFO] Testing #dockInviteBtn visibility, dimensions, and overlap across viewports...\n');

    for (const vp of TEST_VIEWPORTS) {
      console.log(`------------------------------------------------------------------------`);
      console.log(`  VIEWPORT: ${vp.name} (${vp.w}x${vp.h}, ${vp.type})`);
      console.log(`------------------------------------------------------------------------`);

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', {
        enabled: vp.mobile,
        maxTouchPoints: vp.mobile ? 5 : 1
      });
      await sleep(80);

      const metrics = await cdp.eval(`(() => {
        const btn = document.getElementById('dockInviteBtn');
        const svg = btn ? btn.querySelector('svg') : null;
        const pillDock = document.querySelector('.floating-pill-dock');
        const pillButtons = pillDock ? Array.from(pillDock.querySelectorAll('.pill-btn, .pill-split-group')) : [];

        if (!btn) return { exists: false };

        const cs = window.getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();
        const pillRect = pillDock ? pillDock.getBoundingClientRect() : null;
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        // Check overlap with any pill buttons inside the pill dock
        const overlappingButtons = pillButtons.filter(pb => {
          const pr = pb.getBoundingClientRect();
          const overlapX = !(rect.right <= pr.left || rect.left >= pr.right);
          const overlapY = !(rect.bottom <= pr.top || rect.top >= pr.bottom);
          return overlapX && overlapY;
        }).map(pb => pb.id || pb.className);

        const dockOverlap = pillRect ? (
          !(rect.right <= pillRect.left || rect.left >= pillRect.right) &&
          !(rect.bottom <= pillRect.top || rect.top >= pillRect.bottom)
        ) : false;

        return {
          exists: true,
          display: cs.display,
          visibility: cs.visibility,
          opacity: parseFloat(cs.opacity),
          zIndex: parseInt(cs.zIndex, 10) || 0,
          pointerEvents: cs.pointerEvents,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          inBounds: rect.left >= 0 && rect.right <= winW + 1 && rect.top >= 0 && rect.bottom <= winH + 1,
          hasSvg: !!svg,
          dockOverlap,
          overlappingButtons
        };
      })()`);

      assert(metrics.exists, `${vp.name}: #dockInviteBtn element exists in DOM`);
      assert(metrics.display !== 'none', `${vp.name}: display is not "none" (got: ${metrics.display})`, metrics.display);
      assert(metrics.visibility !== 'hidden', `${vp.name}: visibility is not "hidden" (got: ${metrics.visibility})`, metrics.visibility);
      assert(metrics.opacity > 0, `${vp.name}: opacity is greater than 0 (got: ${metrics.opacity})`, metrics.opacity);
      assert(metrics.width >= 44 && metrics.height >= 44, `${vp.name}: meets 44px minimum touch target threshold (got: ${metrics.width}x${metrics.height})`, `${metrics.width}x${metrics.height}`);
      assert(metrics.zIndex >= 40, `${vp.name}: proper z-index priority (got: ${metrics.zIndex})`, metrics.zIndex);
      assert(metrics.hasSvg, `${vp.name}: contains user-plus invite SVG graphic`);
      assert(metrics.inBounds, `${vp.name}: positioned fully inside viewport bounds`);
      assert(!metrics.dockOverlap, `${vp.name}: zero overlap with floating pill dock`, `overlapping: ${metrics.overlappingButtons.join(', ')}`);
      assert(metrics.overlappingButtons.length === 0, `${vp.name}: zero overlap with any pill buttons`, `overlapping: ${metrics.overlappingButtons.join(', ')}`);
    }

    console.log(`\n------------------------------------------------------------------------`);
    console.log(`  INTERACTION TEST: Click/Tap Copy Invite Link & Toast Verification`);
    console.log(`------------------------------------------------------------------------`);

    // Set mobile viewport for interaction test
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 3.0,
      mobile: true
    });
    await sleep(100);

    const interactionResult = await cdp.eval(`(async () => {
      const btn = document.getElementById('dockInviteBtn');
      const toastContainer = document.getElementById('toastContainer');
      if (!btn) return { success: false, reason: 'btn not found' };

      // Clear any prior toasts
      if (toastContainer) toastContainer.innerHTML = '';

      // Spy on clipboard
      let clipboardText = null;
      if (!navigator.clipboard) {
        navigator.clipboard = {};
      }
      navigator.clipboard.writeText = async function(text) {
        clipboardText = text;
        return Promise.resolve();
      };

      btn.click();
      await new Promise(r => setTimeout(r, 100));

      const toast = toastContainer ? toastContainer.querySelector('.toast') : null;

      return {
        success: true,
        toastFound: !!toast,
        toastText: toast ? toast.innerText : '',
        clipboardText
      };
    })()`);

    assert(interactionResult.success, 'Click/tap event dispatched on #dockInviteBtn successfully');
    assert(interactionResult.toastFound, 'Toast element was added to #toastContainer');
    assert(interactionResult.toastText.includes('Invite link copied'), `Toast message confirms invite link copied (got: "${interactionResult.toastText}")`);
    assert(interactionResult.clipboardText && interactionResult.clipboardText.includes('/room/'), `Clipboard text contains valid room invite URL (got: "${interactionResult.clipboardText}")`);

    // Verify fallback clipboard execution on unsupported environments
    const fallbackResult = await cdp.eval(`(async () => {
      const btn = document.getElementById('dockInviteBtn');
      const toastContainer = document.getElementById('toastContainer');
      if (toastContainer) toastContainer.innerHTML = '';

      // Mock prompt so it does not block execution
      window.prompt = () => {};

      // Simulate environment where navigator.clipboard.writeText throws
      navigator.clipboard.writeText = () => Promise.reject(new Error('Permission denied'));

      btn.click();
      await new Promise(r => setTimeout(r, 100));

      const toast = toastContainer ? toastContainer.querySelector('.toast') : null;

      return {
        fallbackToast: !!toast,
        fallbackMsg: toast ? toast.innerText : ''
      };
    })()`);

    assert(fallbackResult.fallbackToast, 'Fallback clipboard mechanism displays confirmation toast');

  } catch (err) {
    console.error('[ERROR] Test runner error:', err);
    failedCount++;
    failureLog.push(err.message);
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
    }
    if (edgeInfo && edgeInfo.proc) {
      try {
        process.kill(edgeInfo.proc.pid);
        fs.rmSync(edgeInfo.tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
    if (server) {
      try {
        server.closeAllConnections?.();
        server.close();
      } catch (e) {}
    }

    console.log('\n========================================================================');
    console.log(`  COPY INVITE LINK ICON AUDIT SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('========================================================================\n');

    if (failureLog.length > 0) {
      console.error('Failure Details:');
      failureLog.forEach(f => console.error('  ' + f));
    }
    process.exit(failedCount === 0 ? 0 : 1);
  }
}

runTests();
