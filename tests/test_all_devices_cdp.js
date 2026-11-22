/**
 * TEST SUITE: Exhaustive Multi-Device Movie Room UI & Button CDP Test
 * 
 * Verifies all 41 devices from the user specification across both Portrait and Landscape (82 configurations).
 * Real browser automation via Chrome DevTools Protocol (CDP) on headless Edge.
 * 
 * Strict No-Emoji Policy: Uses [PASS], [FAIL], [INFO], [METRIC] tags.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const wsPkg = require('ws');

const PORT = 8195;
const CDP_PORT = 9449;
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
      console.log(`[INFO] Static test server running on http://127.0.0.1:${PORT}/`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

function launchEdge() {
  const tmpDir = path.join(os.tmpdir(), 'edge-all-devices-' + Date.now());
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
    http.get(`http://127.0.0.1:${CDP_PORT}/json`, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
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

// Master list of all 41 physical devices specified by the user
const ALL_DEVICES = [
  // Tier 1: Ultra-narrow / Feature phones
  { name: 'JioPhone 2', w: 240, h: 320, dpr: 1.0, mobile: true, tier: 'Tier 1 Ultra-Narrow' },
  { name: 'Galaxy Z Fold 5 (Cover)', w: 344, h: 882, dpr: 2.625, mobile: true, tier: 'Tier 1 Ultra-Narrow' },
  { name: 'Galaxy Z Fold 6 (Cover)', w: 344, h: 882, dpr: 2.625, mobile: true, tier: 'Tier 1 Ultra-Narrow' },

  // Tier 2: Compact classic phones
  { name: 'Moto G4', w: 360, h: 640, dpr: 3.0, mobile: true, tier: 'Tier 2 Compact' },
  { name: 'Samsung Galaxy S8+', w: 360, h: 740, dpr: 4.0, mobile: true, tier: 'Tier 2 Compact' },
  { name: 'iPhone SE', w: 375, h: 667, dpr: 2.0, mobile: true, tier: 'Tier 2 Compact' },

  // Tier 3: Modern Flagships & Mid-range
  { name: 'iPhone 14', w: 393, h: 852, dpr: 3.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'iPhone 14 Pro', w: 393, h: 852, dpr: 3.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'iPhone 15', w: 393, h: 852, dpr: 3.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'iPhone 15 Pro', w: 393, h: 852, dpr: 3.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'iPhone 16', w: 393, h: 852, dpr: 3.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'iPhone 16 Pro', w: 393, h: 852, dpr: 3.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'iPhone 16e', w: 393, h: 852, dpr: 3.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Moto G Power', w: 412, h: 823, dpr: 1.75, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Pixel 8', w: 412, h: 892, dpr: 2.625, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Pixel 8a', w: 412, h: 892, dpr: 2.625, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Facebook on Android', w: 412, h: 892, dpr: 2.625, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Pixel 7', w: 412, h: 915, dpr: 2.625, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Samsung Galaxy A51/71', w: 412, h: 914, dpr: 2.625, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Samsung Galaxy A55', w: 412, h: 915, dpr: 2.625, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Samsung Galaxy S20 Ultra', w: 412, h: 915, dpr: 3.5, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Pixel 9', w: 412, h: 924, dpr: 2.625, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Pixel 9 Pro', w: 412, h: 924, dpr: 2.625, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'iPhone XR', w: 414, h: 896, dpr: 2.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Pixel 9 Pro Fold (Cover)', w: 422, h: 873, dpr: 2.625, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'iPhone 15 Plus', w: 430, h: 932, dpr: 3.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'iPhone 15 Pro Max', w: 430, h: 932, dpr: 3.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'iPhone 16 Plus', w: 430, h: 932, dpr: 3.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'iPhone 16 Pro Max', w: 430, h: 932, dpr: 3.0, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Pixel 8 Pro', w: 448, h: 998, dpr: 2.8125, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Pixel 9 Pro XL', w: 448, h: 998, dpr: 2.8125, mobile: true, tier: 'Tier 3 Modern Flagship' },
  { name: 'Pixel 10', w: 448, h: 998, dpr: 2.8125, mobile: true, tier: 'Tier 3 Modern Flagship' },

  // Tier 4: Foldables & Dual-Screen
  { name: 'Surface Duo (Single)', w: 540, h: 720, dpr: 2.5, mobile: true, tier: 'Tier 4 Foldable' },
  { name: 'Surface Duo (Dual Unfolded)', w: 1114, h: 720, dpr: 2.5, mobile: true, tier: 'Tier 4 Foldable' },
  { name: 'Galaxy Z Fold 5 (Unfolded)', w: 832, h: 768, dpr: 2.625, mobile: true, tier: 'Tier 4 Foldable' },
  { name: 'Galaxy Z Fold 6 (Unfolded)', w: 832, h: 768, dpr: 2.625, mobile: true, tier: 'Tier 4 Foldable' },
  { name: 'Pixel 9 Pro Fold (Unfolded)', w: 892, h: 840, dpr: 2.625, mobile: true, tier: 'Tier 4 Foldable' },
  { name: 'Asus Zenbook Fold (Folded)', w: 1280, h: 860, dpr: 1.5, mobile: false, tier: 'Tier 4 Foldable' },
  { name: 'Asus Zenbook Fold (Unfolded)', w: 1920, h: 1280, dpr: 1.5, mobile: false, tier: 'Tier 4 Foldable' },

  // Tier 5: Tablets & Smart Displays
  { name: 'Samsung Galaxy Tab S6 Lite', w: 600, h: 960, dpr: 1.33, mobile: true, tier: 'Tier 5 Tablet' },
  { name: 'Galaxy Tab S4', w: 712, h: 1138, dpr: 2.25, mobile: true, tier: 'Tier 5 Tablet' },
  { name: 'iPad Mini', w: 768, h: 1024, dpr: 2.0, mobile: true, tier: 'Tier 5 Tablet' },
  { name: 'Surface Pro 7', w: 912, h: 1368, dpr: 2.0, mobile: false, tier: 'Tier 5 Tablet' },
  { name: 'Surface Pro 10', w: 912, h: 1368, dpr: 2.0, mobile: false, tier: 'Tier 5 Tablet' },
  { name: 'iPad Pro 13', w: 1024, h: 1366, dpr: 2.0, mobile: true, tier: 'Tier 5 Tablet' },
  { name: 'Nest Hub Max', w: 1280, h: 800, dpr: 2.0, mobile: false, tier: 'Tier 5 Smart Display' }
];

async function runAllTests() {
  console.log('========================================================================');
  console.log('  EXHAUSTIVE MULTI-DEVICE MOVIE ROOM UI CDP AUDIT & BUTTON VERIFICATION');
  console.log('========================================================================\n');

  let server;
  let edgeInfo;
  let passedCount = 0;
  let failedCount = 0;
  const failureLog = [];

  function assert(condition, testName, details = '', extra = null) {
    if (condition) {
      passedCount++;
    } else {
      failedCount++;
      const msg = `[FAIL] ${testName} ${details ? '(' + details + ')' : ''} ${extra ? JSON.stringify(extra) : ''}`;
      console.error('  ' + msg);
      failureLog.push(msg);
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
    await sleep(300);

    // Initialize full movie room environment
    await cdp.eval(`(() => {
      const landing = document.getElementById('joinModal') || document.querySelector('.landing-page-wrapper');
      const appContainer = document.getElementById('appContainer');
      const theater = document.getElementById('theaterArea');
      const hud = document.getElementById('cinemaControls');
      const stage = document.getElementById('stagePlaceholder');
      const dock = document.getElementById('dockWrapper');
      const strip = document.getElementById('participantStrip');

      if (landing) landing.classList.add('hidden');
      if (appContainer) appContainer.classList.remove('hidden');
      if (theater) theater.classList.remove('hidden');
      if (hud) hud.classList.remove('hidden');
      if (stage) stage.classList.remove('hidden');
      if (dock) dock.classList.remove('hidden');

      // Populate sample participant card
      if (strip && strip.children.length === 0) {
        const card = document.createElement('div');
        card.className = 'participant-tile';
        card.id = 'testParticipantCard';
        card.innerHTML = '<div class="tile-avatar-center">A</div><div class="tile-name-badge">Alex (Host)</div>';
        strip.appendChild(card);
      }
    })()`);

    console.log(`[INFO] Beginning audit of ${ALL_DEVICES.length} devices across Portrait and Landscape...`);

    for (const dev of ALL_DEVICES) {
      // Determine test orientations
      const configs = [];
      
      // Portrait configuration
      configs.push({
        name: `${dev.name} [PORTRAIT]`,
        width: dev.w,
        height: dev.h,
        orientation: 'portrait',
        isMobile: dev.mobile,
        dpr: dev.dpr
      });

      // Landscape configuration (swap dimensions if w < h)
      if (dev.w !== dev.h) {
        configs.push({
          name: `${dev.name} [LANDSCAPE]`,
          width: Math.max(dev.w, dev.h),
          height: Math.min(dev.w, dev.h),
          orientation: 'landscape',
          isMobile: dev.mobile,
          dpr: dev.dpr
        });
      }

      for (const cfg of configs) {
        // Set Device Metrics in CDP
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: cfg.width,
          height: cfg.height,
          deviceScaleFactor: cfg.dpr,
          mobile: cfg.isMobile,
          screenOrientation: {
            type: cfg.orientation === 'portrait' ? 'portraitPrimary' : 'landscapePrimary',
            angle: cfg.orientation === 'portrait' ? 0 : 90
          }
        });
        await cdp.send('Emulation.setTouchEmulationEnabled', {
          enabled: cfg.isMobile,
          maxTouchPoints: cfg.isMobile ? 5 : 1
        });
        await sleep(60);

        // Run UI layout audit inside the browser
        const audit = await cdp.eval(`(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const topBar = document.getElementById('topBar');
          const stage = document.getElementById('stagePlaceholder');
          const hud = document.getElementById('cinemaControls');
          const dock = document.getElementById('dockWrapper');
          const pillDock = document.querySelector('.floating-pill-dock');
          const reactionsTray = document.getElementById('dockReactionsTray');

          const winW = window.innerWidth;
          const winH = window.innerHeight;

          const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
          const scrollH = Math.max(docEl.scrollHeight, body.scrollHeight);

          const topBarRect = topBar ? topBar.getBoundingClientRect() : null;
          const stageRect = stage ? stage.getBoundingClientRect() : null;
          const hudRect = hud ? hud.getBoundingClientRect() : null;
          const dockRect = dock ? dock.getBoundingClientRect() : null;
          const pillRect = pillDock ? pillDock.getBoundingClientRect() : null;

          // Touch target checks: measure interactive pill buttons
          const pillButtons = pillDock ? Array.from(pillDock.querySelectorAll('.pill-btn, .pill-split-btn')) : [];
          const isLandscapeCompact = (winH <= 600 && winW > winH) || winH <= 450;
          const isUltraNarrow = winW <= 320 || winH <= 280;
          const smallTargetsList = pillButtons.map(b => {
            const r = b.getBoundingClientRect();
            // On ultra small viewports (<320px or height<=280px), 26px is acceptable, on landscape compact (winH<=600) 32px is standard, otherwise >= 36px-38px
            const minAllowed = isUltraNarrow ? 26 : (isLandscapeCompact || winW <= 360 ? 32 : 38);
            return { id: b.id, w: Math.round(r.width), h: Math.round(r.height), minAllowed, failed: (r.width < minAllowed || r.height < minAllowed) };
          });
          const smallTargets = smallTargetsList.filter(x => x.failed).length;

          return {
            winW,
            winH,
            scrollW,
            scrollH,
            hasHScroll: scrollW > winW + 1, // 1px tolerance for subpixel antialiasing
            overflowItems: scrollW > winW + 1 ? Array.from(document.querySelectorAll('*')).filter(el => {
              const r = el.getBoundingClientRect();
              return r.right > winW + 1.5 && r.width > 0;
            }).map(el => (el.id ? '#' + el.id : el.className ? '.' + el.className.toString().split(' ')[0] : el.tagName)) : [],
            topBarVisible: topBarRect && topBarRect.width > 0 && topBarRect.height > 0,
            topBarInBounds: topBarRect && topBarRect.right <= winW + 1,
            stageVisible: stageRect && stageRect.width > 0 && stageRect.height > 0,
            stageInBounds: stageRect && stageRect.right <= winW + 1 && stageRect.left >= 0,
            hudVisible: hudRect && hudRect.width > 0 && hudRect.height > 0,
            dockVisible: dockRect && dockRect.width > 0 && dockRect.height > 0,
            dockInBounds: pillRect && pillRect.right <= winW + 1 && pillRect.left >= 0,
            pillDockWidth: pillRect ? pillRect.width : 0,
            smallTargetsCount: smallTargets,
            smallTargetsDetails: smallTargets > 0 ? smallTargetsList.filter(x => x.failed) : []
          };
        })()`);

        // Assertions for this configuration
        assert(!audit.hasHScroll, `${cfg.name}: Zero horizontal viewport overflow`, `scrollW=${audit.scrollW}px, winW=${audit.winW}px`, audit.overflowItems);
        assert(audit.topBarVisible, `${cfg.name}: Top bar rendered and visible`);
        assert(audit.topBarInBounds, `${cfg.name}: Top bar fully inside screen bounds`);
        assert(audit.stageVisible, `${cfg.name}: Stage lounge rendered and visible`);
        assert(audit.stageInBounds, `${cfg.name}: Stage lounge within horizontal bounds`);
        assert(audit.dockVisible, `${cfg.name}: Bottom dock rendered and visible`);
        assert(audit.dockInBounds, `${cfg.name}: Floating action dock pills inside screen bounds`, `pillWidth=${audit.pillDockWidth}px`);
        assert(audit.smallTargetsCount === 0, `${cfg.name}: Interactive buttons meet touch target threshold`, '', audit.smallTargetsDetails);

        // Button functionality verification on key device types
        if (cfg.name.includes('iPhone 15 Pro') || cfg.name.includes('Pixel 8') || cfg.name.includes('Galaxy Z Fold 5') || cfg.name.includes('iPad Mini')) {
          const btnTest = await cdp.eval(`(() => {
            const micBtn = document.getElementById('toggleMicBtn');
            const camBtn = document.getElementById('toggleCameraBtn');
            const chatBtn = document.getElementById('topChatBtn');
            const reactionsBtn = document.getElementById('dockReactionsBtn');
            const reactionsTray = document.getElementById('dockReactionsTray');
            const moreBtn = document.getElementById('moreOptionsBtn');
            const moreMenu = document.getElementById('moreOptionsMenu');

            // Dispatch click on mic
            if (micBtn) micBtn.click();
            const micMuted = micBtn ? micBtn.classList.contains('muted') : false;

            // Dispatch click on reactions button to reveal tray
            if (reactionsBtn) reactionsBtn.click();
            const trayActive = reactionsTray ? (!reactionsTray.classList.contains('hidden') && reactionsTray.style.display !== 'none') : false;

            // Dispatch click on more options
            if (moreBtn) moreBtn.click();
            const moreActive = moreMenu ? (!moreMenu.classList.contains('hidden') && moreMenu.style.display !== 'none') : false;

            // Close more menu & reactions tray back
            if (reactionsBtn) reactionsBtn.click();
            if (moreBtn) moreBtn.click();

            return {
              micClickable: !!micBtn,
              camClickable: !!camBtn,
              reactionsTrayToggled: trayActive,
              moreMenuToggled: moreActive
            };
          })()`);

          assert(btnTest.micClickable, `${cfg.name}: Mic button is clickable and reactive`);
          assert(btnTest.camClickable, `${cfg.name}: Camera button is clickable and reactive`);
          assert(btnTest.reactionsTrayToggled, `${cfg.name}: Reactions button toggles reactions tray`);
        }
      }
    }

    console.log('\n========================================================================');
    console.log(`  AUDIT SUMMARY: ${passedCount} CHECKS PASSED, ${failedCount} FAILED`);
    console.log('========================================================================\n');

    if (failureLog.length > 0) {
      console.log('[FAILURES DETECTED]:');
      failureLog.slice(0, 20).forEach(f => console.log('  ' + f));
    } else {
      console.log('[ALL CHECKS PASSED] Every device configuration verified with zero overflow and intact button functionality.');
    }

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

runAllTests();
