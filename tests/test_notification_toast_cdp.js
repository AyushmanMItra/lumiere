/**
 * TEST SUITE: Universal Notification & Toast HUD Capsule CDP Verification
 * 
 * Verifies that:
 * 1. #toastContainer is positioned at the top-center of the cinema viewport.
 * 2. .toast geometry matches the compact obsidian glassmorphic HUD pill (~34px height, full capsule radius).
 * 3. In-place deduplication: successive rapid notifications update the single active pill rather than spawning stacked duplicate cards.
 * 4. Value accumulation: seek forwards and rewinds accumulate (+10s -> +20s -> +30s, -10s -> -20s) with bounce animation.
 * 5. Universal scope: state changes (play/pause, volume, mute/unmute, copy invite, pop-out, dialogue booster, ambient glow, participant events) smoothly replace text and icon in-place.
 * 6. Non-blocking click-through: pointer-events are disabled so clicks pass through to video/UI underneath.
 * 7. Mobile and tablet responsiveness across standard viewports (320px to 1920px).
 * 
 * Strict No-Emoji Policy: Uses [PASS], [FAIL], [INFO] textual tags.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const wsPkg = require('ws');

const PORT = 8240;
const CDP_PORT = 9485;
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
  const tmpDir = path.join(os.tmpdir(), 'edge-toast-test-' + Date.now());
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

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

const TEST_VIEWPORTS = [
  { name: 'Ultra-Narrow Phone (320x568)', w: 320, h: 568, mobile: true },
  { name: 'Flagship Phone (393x852)', w: 393, h: 852, mobile: true },
  { name: 'Mobile Landscape (844x390)', w: 844, h: 390, mobile: true },
  { name: 'Tablet Portrait (768x1024)', w: 768, h: 1024, mobile: true },
  { name: 'Tablet Landscape (1024x768)', w: 1024, h: 768, mobile: true },
  { name: 'Desktop Full HD (1920x1080)', w: 1920, h: 1080, mobile: false }
];

async function runTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: UNIVERSAL NOTIFICATION & TOAST HUD CAPSULE CDP VERIFICATION');
  console.log('========================================================================\n');

  let server;
  let browserInfo;
  let ws;

  try {
    server = await startServer();
    browserInfo = await launchEdge();
    const wsUrl = await getPageWSUrl();
    const WebSocket = wsPkg.WebSocket || wsPkg;
    ws = new WebSocket(wsUrl);
    await new Promise(r => ws.onopen = r);
    const client = new CDPClient(ws);

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('CSS.enable');
    await client.send('Runtime.enable');

    // Wait for document ready and app.js initialization
    let isReady = false;
    for (let i = 0; i < 60; i++) {
      try {
        const ready = await client.eval('document.readyState === "complete" && typeof window.showToast === "function"');
        if (ready) {
          isReady = true;
          break;
        }
      } catch (_) {}
      await sleep(100);
    }
    if (!isReady) {
      // Force navigation if Edge opened blank
      await client.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      for (let i = 0; i < 60; i++) {
        try {
          const ready = await client.eval('document.readyState === "complete" && typeof window.showToast === "function"');
          if (ready) {
            isReady = true;
            break;
          }
        } catch (_) {}
        await sleep(100);
      }
    }
    await sleep(200);

    // Initialize in-room state
    await client.eval(`(() => {
      const landing = document.getElementById('joinModal');
      const appContainer = document.getElementById('appContainer');
      const theater = document.getElementById('theaterArea');
      const hud = document.getElementById('cinemaControls');
      if (landing) landing.classList.add('hidden');
      if (appContainer) appContainer.classList.remove('hidden');
      if (theater) theater.classList.remove('hidden');
      if (hud) hud.classList.remove('hidden');
      document.body.classList.add('in-room');
    })()`);

    // -------------------------------------------------------------------------
    // TEST 1: Top-Center Positioning & Glassmorphic Capsule Geometry
    // -------------------------------------------------------------------------
    console.log('[INFO] Test 1: Container Top-Center Placement & HUD Capsule Geometry...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Display a test toast
    await client.eval(`window.showToast('Test Notification', 'info')`);
    await sleep(80);

    const containerMetrics = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toast = container ? container.querySelector('.toast') : null;
      if (!container || !toast) return null;
      const cRect = container.getBoundingClientRect();
      const tRect = toast.getBoundingClientRect();
      const cStyle = window.getComputedStyle(container);
      const tStyle = window.getComputedStyle(toast);

      return {
        containerPosition: cStyle.position,
        containerPointerEvents: cStyle.pointerEvents,
        containerZIndex: parseInt(cStyle.zIndex, 10),
        containerTop: cRect.top,
        containerCenterX: cRect.left + (cRect.width / 2),
        toastHeight: tRect.height,
        toastBorderRadius: parseFloat(tStyle.borderRadius),
        toastPointerEvents: tStyle.pointerEvents,
        toastColor: tStyle.color,
        hasBackdropFilter: Boolean(tStyle.backdropFilter || tStyle.webkitBackdropFilter),
        hasSvgIcon: Boolean(toast.querySelector('.toast-icon svg')),
        toastText: toast.innerText.trim()
      };
    })()`);

    assert(containerMetrics !== null, 'Container #toastContainer and .toast element exist in DOM');
    assert(containerMetrics.containerPosition === 'fixed', `Container position is fixed (got: ${containerMetrics.containerPosition})`);
    assert(containerMetrics.containerPointerEvents === 'none', 'Container pointer-events is "none" for non-blocking click-through');
    assert(containerMetrics.containerZIndex >= 10000, `Container z-index priority is >= 10000 (got: ${containerMetrics.containerZIndex})`);
    assert(containerMetrics.containerTop >= 16 && containerMetrics.containerTop <= 40, `Container top position is placed at top (got: ${containerMetrics.containerTop}px)`);
    assert(Math.abs(containerMetrics.containerCenterX - (1920 / 2)) <= 2, `Container is centered horizontally (centerX: ${containerMetrics.containerCenterX}, target: 960)`);
    assert(containerMetrics.toastHeight >= 30 && containerMetrics.toastHeight <= 38, `Toast height matches compact HUD capsule (~34px, got: ${containerMetrics.toastHeight}px)`);
    assert(containerMetrics.toastBorderRadius >= 16, `Toast border-radius is full pill capsule (got: ${containerMetrics.toastBorderRadius}px)`);
    assert(containerMetrics.toastPointerEvents === 'none', 'Toast element pointer-events is "none"');
    assert(containerMetrics.hasSvgIcon, 'Toast element contains a crisp SVG icon');
    assert(containerMetrics.toastText === 'Test Notification', `Toast message rendered correctly (got: "${containerMetrics.toastText}")`);

    // -------------------------------------------------------------------------
    // TEST 2: Seek Value Accumulation (+10s -> +20s -> +30s and -10s -> -20s)
    // -------------------------------------------------------------------------
    console.log('\n[INFO] Test 2: Seek Forward/Rewind Accumulation & Bounce Animation...');
    // Clear container
    await client.eval(`document.getElementById('toastContainer').innerHTML = ''`);

    // First forward tap: +10s
    await client.eval(`window.showToast('+10s')`);
    await sleep(60);
    let seekData = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toasts = container.querySelectorAll('.toast');
      const t = toasts[0];
      return {
        count: toasts.length,
        text: t ? t.innerText.trim() : '',
        hasBounce: t ? t.classList.contains('toast-bounce') : false
      };
    })()`);
    assert(seekData.count === 1, 'Only 1 active toast exists for +10s');
    assert(seekData.text === '+10s', `Seek text is +10s (got: "${seekData.text}")`);

    // Second forward tap: +20s (in-place update, NO stacked duplicate cards!)
    await client.eval(`window.showToast('+10s')`);
    await sleep(60);
    seekData = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toasts = container.querySelectorAll('.toast');
      const t = toasts[0];
      return {
        count: toasts.length,
        text: t ? t.innerText.trim() : '',
        hasBounce: t ? t.classList.contains('toast-bounce') : false
      };
    })()`);
    assert(seekData.count === 1, 'Zero duplicate cards spawned; single pill updated in-place');
    assert(seekData.text === '+20s', `Seek text accumulated to +20s (got: "${seekData.text}")`);
    assert(seekData.hasBounce, 'Bounce animation class applied on in-place update');

    // Third forward tap: +30s
    await client.eval(`window.showToast('Forwarded 10s')`);
    await sleep(60);
    seekData = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toasts = container.querySelectorAll('.toast');
      const t = toasts[0];
      return {
        count: toasts.length,
        text: t ? t.innerText.trim() : ''
      };
    })()`);
    assert(seekData.count === 1, 'Still only 1 active toast exists after 3rd forward');
    assert(seekData.text === '+30s', `Seek text accumulated to +30s from "Forwarded 10s" (got: "${seekData.text}")`);

    // Fourth forward tap with space (+ 10s): +40s
    await client.eval(`window.showToast('+ 10s')`);
    await sleep(60);
    seekData = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toasts = container.querySelectorAll('.toast');
      const t = toasts[0];
      return {
        count: toasts.length,
        text: t ? t.innerText.trim() : ''
      };
    })()`);
    assert(seekData.count === 1, 'Only 1 active toast exists after spaced seek');
    assert(seekData.text === '+40s', `Seek text accumulated to +40s from "+ 10s" (got: "${seekData.text}")`);

    // Fifth forward tap with natural phrase (Forward 10 sec): +50s
    await client.eval(`window.showToast('Forward 10 sec')`);
    await sleep(60);
    seekData = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toasts = container.querySelectorAll('.toast');
      const t = toasts[0];
      return {
        count: toasts.length,
        text: t ? t.innerText.trim() : ''
      };
    })()`);
    assert(seekData.count === 1, 'Only 1 active toast exists after natural forward');
    assert(seekData.text === '+50s', `Seek text accumulated to +50s from "Forward 10 sec" (got: "${seekData.text}")`);

    // Rewind tap: switches direction to -10s in the same capsule
    await client.eval(`window.showToast('-10s')`);
    await sleep(60);
    seekData = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toasts = container.querySelectorAll('.toast');
      const t = toasts[0];
      return {
        count: toasts.length,
        text: t ? t.innerText.trim() : ''
      };
    })()`);
    assert(seekData.count === 1, 'Single active toast retained on direction switch');
    assert(seekData.text === '-10s', `Seek direction smoothly switched to -10s (got: "${seekData.text}")`);

    // Second rewind tap: accumulates to -20s
    await client.eval(`window.showToast('Rewound 10s')`);
    await sleep(60);
    seekData = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toasts = container.querySelectorAll('.toast');
      const t = toasts[0];
      return {
        count: toasts.length,
        text: t ? t.innerText.trim() : ''
      };
    })()`);
    assert(seekData.count === 1, 'Single active toast retained for successive rewind');
    assert(seekData.text === '-20s', `Rewind text accumulated to -20s from "Rewound 10s" (got: "${seekData.text}")`);

    // Third rewind tap with "Rewind 10s": accumulates to -30s
    await client.eval(`window.showToast('Rewind 10s')`);
    await sleep(60);
    seekData = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toasts = container.querySelectorAll('.toast');
      const t = toasts[0];
      return {
        count: toasts.length,
        text: t ? t.innerText.trim() : ''
      };
    })()`);
    assert(seekData.count === 1, 'Single active toast retained for "Rewind 10s"');
    assert(seekData.text === '-30s', `Rewind text accumulated to -30s from "Rewind 10s" (got: "${seekData.text}")`);

    // Fourth rewind tap with spaced minus ("- 10s"): accumulates to -40s
    await client.eval(`window.showToast('- 10s')`);
    await sleep(60);
    seekData = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toasts = container.querySelectorAll('.toast');
      const t = toasts[0];
      return {
        count: toasts.length,
        text: t ? t.innerText.trim() : ''
      };
    })()`);
    assert(seekData.count === 1, 'Single active toast retained for "- 10s"');
    assert(seekData.text === '-40s', `Rewind text accumulated to -40s from "- 10s" (got: "${seekData.text}")`);

    // Fifth rewind tap with phrase ("Rewind 10 sec"): accumulates to -50s
    await client.eval(`window.showToast('Rewind 10 sec')`);
    await sleep(60);
    seekData = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toasts = container.querySelectorAll('.toast');
      const t = toasts[0];
      return {
        count: toasts.length,
        text: t ? t.innerText.trim() : ''
      };
    })()`);
    assert(seekData.count === 1, 'Single active toast retained for "Rewind 10 sec"');
    assert(seekData.text === '-50s', `Rewind text accumulated to -50s from "Rewind 10 sec" (got: "${seekData.text}")`);

    // -------------------------------------------------------------------------
    // TEST 3: In-Place Deduplication Across Universal Notification Scope
    // -------------------------------------------------------------------------
    console.log('\n[INFO] Test 3: Universal In-Place Deduplication Across Notification Scope...');
    const universalScenarios = [
      { call: `window.showToast('Playing')`, expectedText: 'Playing', label: 'Play State' },
      { call: `window.showToast('Paused')`, expectedText: 'Paused', label: 'Pause State' },
      { call: `window.showToast('Volume 65%')`, expectedText: 'Volume 65%', label: 'Volume Change' },
      { call: `window.showToast('Volume 70%')`, expectedText: 'Volume 70%', label: 'Volume Step Up' },
      { call: `window.showToast('Muted')`, expectedText: 'Muted', label: 'Mute Toggle' },
      { call: `window.showToast('Invite link copied!')`, expectedText: 'Invite link copied!', label: 'Copy Invite Link' },
      { call: `window.showToast('Invite link copied!')`, expectedText: 'Invite link copied!', label: 'Repeated Rapid Copy' },
      { call: `window.showToast('Movie Screen popped out. Drag title bar to move.')`, expectedText: 'Movie Screen popped out. Drag title bar to move.', label: 'Window Pop-out' },
      { call: `window.showToast('Movie Screen docked to theater')`, expectedText: 'Movie Screen docked to theater', label: 'Window Dock' },
      { call: `window.showToast('Ambient Lighting: ON')`, expectedText: 'Ambient Lighting: ON', label: 'Ambient Glow ON' },
      { call: `window.showToast('Ambient Lighting: OFF')`, expectedText: 'Ambient Lighting: OFF', label: 'Ambient Glow OFF' },
      { call: `window.showToast('Dialogue Booster (Night Mode) Enabled')`, expectedText: 'Dialogue Booster (Night Mode) Enabled', label: 'Dialogue Booster ON' },
      { call: `window.showToast('Dialogue Booster Disabled')`, expectedText: 'Dialogue Booster Disabled', label: 'Dialogue Booster OFF' },
      { call: `window.showToast('Sarah Connor joined')`, expectedText: 'Sarah Connor joined', label: 'Participant Join' },
      { call: `window.showToast('Host: Sarah Connor')`, expectedText: 'Host: Sarah Connor', label: 'Host Change' },
      { call: `window.showToast('Now Playing: Interstellar.mkv')`, expectedText: 'Now Playing: Interstellar.mkv', label: 'Movie Event' },
      { call: `window.showToast('Movie stopped by Host')`, expectedText: 'Movie stopped by Host', label: 'Movie Stopped' },
      { call: `window.showToast('Screen sharing started')`, expectedText: 'Screen sharing started', label: 'Screen Share Started' },
      { call: `window.showToast('Loaded: english_subs.srt')`, expectedText: 'Loaded: english_subs.srt', label: 'Subtitle Loaded' },
      { call: `window.showToast('Poll launched!')`, expectedText: 'Poll launched!', label: 'Poll Launched' },
      { call: `window.showToast('Microphone Muted (Media Speaker Active)')`, expectedText: 'Microphone Muted (Media Speaker Active)', label: 'Microphone Status' },
      { call: `window.showToast('Camera access denied or busy', 'error')`, expectedText: 'Camera access denied or busy', label: 'Camera Error' },
      { call: `window.showToast('Warning: Slow connection detected', 'warning')`, expectedText: 'Warning: Slow connection detected', label: 'Warning Toast' }
    ];

    for (const sc of universalScenarios) {
      await client.eval(sc.call);
      await sleep(50);
      const res = await client.eval(`(() => {
        const container = document.getElementById('toastContainer');
        const toasts = container.querySelectorAll('.toast');
        const t = toasts[0];
        return {
          count: toasts.length,
          text: t ? t.innerText.trim() : '',
          hasIcon: Boolean(t && t.querySelector('.toast-icon svg')),
          className: t ? t.className : ''
        };
      })()`);
      assert(res.count === 1, `[${sc.label}] Enforces exactly 1 active pill (got: ${res.count})`);
      assert(res.text === sc.expectedText, `[${sc.label}] Text updated smoothly (got: "${res.text}")`);
      assert(res.hasIcon, `[${sc.label}] Crisp SVG icon rendered for notification`);
      if (sc.call.includes("'warning'")) {
        assert(res.className.includes('toast-warning'), `[${sc.label}] Applied .toast-warning class`);
      }
    }

    // -------------------------------------------------------------------------
    // TEST 4: Non-Blocking Click-Through Verification
    // -------------------------------------------------------------------------
    console.log('\n[INFO] Test 4: Non-Blocking Click-Through Verification...');
    await client.eval(`window.showToast('Click Through Test', 'info')`);
    await sleep(60);

    const clickThroughResult = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toast = container.querySelector('.toast');
      if (!toast) return { error: 'No toast element found' };
      const rect = toast.getBoundingClientRect();
      const midX = rect.left + (rect.width / 2);
      const midY = rect.top + (rect.height / 2);

      // Hit test at the center of the active toast
      const hitElement = document.elementFromPoint(midX, midY);

      return {
        toastHit: hitElement === toast || (container && container.contains(hitElement)),
        hitTagName: hitElement ? hitElement.tagName : 'null',
        hitId: hitElement ? hitElement.id : '',
        hitClass: hitElement ? hitElement.className : ''
      };
    })()`);

    assert(!clickThroughResult.toastHit, `User clicks pass through toast pill (hit underlying element: <${clickThroughResult.hitTagName} id="${clickThroughResult.hitId}" class="${clickThroughResult.hitClass}">)`);

    // -------------------------------------------------------------------------
    // TEST 5: Device Viewport & Mobile Responsiveness
    // -------------------------------------------------------------------------
    console.log('\n[INFO] Test 5: Mobile, Tablet & Desktop Responsive Layout Audit...');
    for (const vp of TEST_VIEWPORTS) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: vp.mobile
      });
      await sleep(80);

      await client.eval(`window.showToast('+20s')`);
      await sleep(60);

      const vpMetrics = await client.eval(`(() => {
        const container = document.getElementById('toastContainer');
        const toast = container.querySelector('.toast');
        if (!container || !toast) return null;
        const cRect = container.getBoundingClientRect();
        const tRect = toast.getBoundingClientRect();
        const tStyle = window.getComputedStyle(toast);

        return {
          windowWidth: window.innerWidth,
          containerLeft: cRect.left,
          containerRight: cRect.right,
          containerWidth: cRect.width,
          containerCenterX: cRect.left + (cRect.width / 2),
          toastHeight: tRect.height,
          toastFontSize: parseFloat(tStyle.fontSize),
          fitsInsideViewport: (cRect.left >= 0 && cRect.right <= window.innerWidth + 1)
        };
      })()`);

      assert(vpMetrics !== null, `[${vp.name}] Toast exists in viewport`);
      assert(vpMetrics.fitsInsideViewport, `[${vp.name}] Contained fully within viewport width (bounds: [${Math.round(vpMetrics.containerLeft)}, ${Math.round(vpMetrics.containerRight)}], viewport: ${vpMetrics.windowWidth})`);
      assert(Math.abs(vpMetrics.containerCenterX - (vp.w / 2)) <= 2, `[${vp.name}] Centered horizontally (center: ${Math.round(vpMetrics.containerCenterX)}, target: ${vp.w / 2})`);
      assert(vpMetrics.toastHeight <= 38, `[${vp.name}] Compact height <= 38px (got: ${vpMetrics.toastHeight}px)`);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Null, Undefined & Empty String Input Safety
    // -------------------------------------------------------------------------
    console.log('\n[INFO] Test 6: Null, Undefined & Empty String Input Safety...');
    // Clear container
    await client.eval(`document.getElementById('toastContainer').innerHTML = ''`);

    await client.eval(`window.showToast(null)`);
    await sleep(40);
    let nullCheck = await client.eval(`document.getElementById('toastContainer').children.length`);
    assert(nullCheck === 0, 'showToast(null) gracefully ignored without creating empty toast');

    await client.eval(`window.showToast(undefined)`);
    await sleep(40);
    let undefinedCheck = await client.eval(`document.getElementById('toastContainer').children.length`);
    assert(undefinedCheck === 0, 'showToast(undefined) gracefully ignored without creating empty toast');

    await client.eval(`window.showToast('')`);
    await sleep(40);
    let emptyCheck = await client.eval(`document.getElementById('toastContainer').children.length`);
    assert(emptyCheck === 0, 'showToast("") gracefully ignored without creating empty toast');

    await client.eval(`window.showToast('   ')`);
    await sleep(40);
    let whitespaceCheck = await client.eval(`document.getElementById('toastContainer').children.length`);
    assert(whitespaceCheck === 0, 'showToast("   ") whitespace gracefully ignored without creating empty toast');

    // -------------------------------------------------------------------------
    // TEST 7: Cinema Fullscreen Container Reparenting
    // -------------------------------------------------------------------------
    console.log('\n[INFO] Test 7: Cinema Fullscreen Container Reparenting...');
    await client.eval(`(() => {
      const cinemaBox = document.getElementById('cinemaBox');
      const container = document.getElementById('toastContainer');
      // Simulate entering fullscreen on cinemaBox
      Object.defineProperty(document, 'fullscreenElement', {
        value: cinemaBox,
        configurable: true,
        writable: true
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    })()`);
    await sleep(50);

    let fsCheck = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const cinemaBox = document.getElementById('cinemaBox');
      return container && container.parentNode === cinemaBox;
    })()`);
    assert(fsCheck, 'toastContainer automatically reparented into cinemaBox during cinema fullscreen');

    // Simulate exiting fullscreen
    await client.eval(`(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        configurable: true,
        writable: true
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    })()`);
    await sleep(50);

    let docCheck = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      return container && container.parentNode === document.body;
    })()`);
    assert(docCheck, 'toastContainer restored to document.body after exiting cinema fullscreen');

    // -------------------------------------------------------------------------
    // TEST 8: Ultra-Long Movie Title & Text Truncation Audit (320px screen)
    // -------------------------------------------------------------------------
    console.log('\n[INFO] Test 8: Ultra-Long Text Flex Truncation Audit...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 320,
      height: 568,
      deviceScaleFactor: 1,
      mobile: true
    });
    await sleep(60);

    const longTitle = 'Now Playing: Interstellar.Special.Extended.Collector.Edition.2014.1080p.BluRay.x264.DTS-HD.MA.5.1-ReleaseGroup.mkv';
    await client.eval(`window.showToast(${JSON.stringify(longTitle)})`);
    await sleep(60);

    const longMetrics = await client.eval(`(() => {
      const container = document.getElementById('toastContainer');
      const toast = container ? container.querySelector('.toast') : null;
      const msg = toast ? toast.querySelector('.toast-message') : null;
      if (!container || !toast || !msg) return null;

      const cRect = container.getBoundingClientRect();
      const tRect = toast.getBoundingClientRect();
      const mStyle = window.getComputedStyle(msg);

      return {
        viewportWidth: window.innerWidth,
        containerWidth: cRect.width,
        toastWidth: tRect.width,
        containerLeft: cRect.left,
        containerRight: cRect.right,
        hasEllipsis: mStyle.textOverflow === 'ellipsis',
        overflowsViewport: (cRect.left < 0 || cRect.right > window.innerWidth)
      };
    })()`);

    assert(longMetrics !== null, 'Ultra-long notification rendered successfully');
    assert(!longMetrics.overflowsViewport, `Ultra-long notification does not overflow 320px viewport (container: ${Math.round(longMetrics.containerWidth)}px, viewport: ${longMetrics.viewportWidth}px)`);
    assert(longMetrics.hasEllipsis, 'CSS text-overflow ellipsis applied to long notification message');

    console.log('\n========================================================================');
    console.log(`  SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('========================================================================\n');

  } finally {
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    if (browserInfo?.proc) {
      try { browserInfo.proc.kill('SIGKILL'); } catch (_) {}
      try {
        fs.rmSync(browserInfo.tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
    if (server) {
      try { server.close(); } catch (_) {}
    }
  }

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('[ERROR] Test runner encountered fatal error:', err);
  process.exit(1);
});
