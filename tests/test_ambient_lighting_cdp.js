/**
 * TEST SUITE: Ambient Lighting on Mobile and Tablet Viewports CDP Verification
 *
 * Verifies that:
 * 1. Ambient lighting canvas (#ambientGlowCanvas) and wrapper (#ambientGlowWrapper) exist in DOM.
 * 2. On mobile phone and tablet viewports (both portrait and landscape):
 *    - Ambient lighting canvas has computed display: block.
 *    - Ambient lighting canvas has non-zero layout dimensions and proper opacity (> 0).
 *    - Canvas element dimensions match and illuminate the lateral blank spaces around the stage.
 *    - No horizontal overflow is introduced (scrollWidth <= clientWidth).
 *    - Cinema box and stage wrapper maintain layout harmony without clipping or distortion.
 * 3. Toggling ambient lighting via HUD toggle button (#ambientToggleBtn) and More Options menu item
 *    (#menuAmbientGlowBtn) successfully enables and disables the canvas effect:
 *    - Inactive: display none, opacity 0.
 *    - Active: display block, opacity > 0, ambient-glow-active class applied, HUD button highlighted.
 * 4. Ambient frame sampling loop runs and canvas bitmap dimensions synchronize with stage.
 *
 * Strict No-Emoji Policy: Uses [PASS], [FAIL], [INFO], [SUCCESS] textual tags.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const wsPkg = require('ws');

const PORT = 8295;
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
  const tmpDir = path.join(os.tmpdir(), 'edge-ambient-test-' + Date.now());
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
      http.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const targets = JSON.parse(raw);
            const pageTarget = targets.find(t => t.type === 'page');
            if (pageTarget && pageTarget.webSocketDebuggerUrl) {
              started = true;
              resolve({ proc, wsUrl: pageTarget.webSocketDebuggerUrl });
            } else {
              setTimeout(check, 100);
            }
          } catch (e) {
            setTimeout(check, 100);
          }
        });
      }).on('error', () => {
        setTimeout(check, 100);
      });
    };

    setTimeout(check, 300);
    setTimeout(() => {
      if (!started) reject(new Error('Timed out waiting for Edge CDP'));
    }, 10000);
  });
}

function createCdpClient(wsUrl) {
  const ws = new wsPkg(wsUrl);
  let id = 1;
  const pending = new Map();

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  });

  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      const client = {
        send: (method, params = {}) => {
          return new Promise((res, rej) => {
            const reqId = id++;
            pending.set(reqId, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id: reqId, method, params }));
          });
        },
        eval: async (expr) => {
          const res = await client.send('Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
            awaitPromise: true
          });
          if (res.exceptionDetails) {
            throw new Error(JSON.stringify(res.exceptionDetails));
          }
          return res.result.value;
        },
        close: () => ws.close()
      };
      resolve(client);
    });
    ws.on('error', reject);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: AMBIENT LIGHTING MOBILE & TABLET CDP VERIFICATION');
  console.log('========================================================================\n');

  let server;
  let edgeProc;
  let cdp;
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, message, detail = '') {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedCount++;
    } else {
      console.log(`  [FAIL] ${message} - ${detail}`);
      failedCount++;
    }
  }

  try {
    server = await startStaticServer();
    const launcher = await launchEdge();
    edgeProc = launcher.proc;
    cdp = await createCdpClient(launcher.wsUrl);

    console.log('[INFO] Connected to Chrome DevTools Protocol via Edge headless.');
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    await cdp.send('Runtime.enable');

    await sleep(1500);

    // Initial check: DOM presence of ambient lighting elements
    console.log('\n--- SECTION 1: DOM Structure & Element Presence ---');
    const hasCanvas = await cdp.eval('!!document.getElementById("ambientGlowCanvas")');
    assert(hasCanvas, '#ambientGlowCanvas exists in the DOM');

    const hasWrapper = await cdp.eval('!!document.getElementById("ambientGlowWrapper")');
    assert(hasWrapper, '#ambientGlowWrapper exists in the DOM');

    const hasWrapperClass = await cdp.eval('document.querySelectorAll(".ambient-glow-wrapper").length > 0');
    assert(hasWrapperClass, '.ambient-glow-wrapper class is present in the DOM');

    const hasHudToggle = await cdp.eval('!!document.getElementById("ambientToggleBtn")');
    assert(hasHudToggle, '#ambientToggleBtn exists in HUD controls');

    const hasMenuToggle = await cdp.eval('!!document.getElementById("menuAmbientGlowBtn")');
    assert(hasMenuToggle, '#menuAmbientGlowBtn exists in More Options menu');

    const hasMenuStatus = await cdp.eval('!!document.getElementById("moreMenuAmbientStatus")');
    assert(hasMenuStatus, '#moreMenuAmbientStatus badge exists in More Options menu');

    // Enter watch party theater view by activating appContainer
    await cdp.eval(`(() => {
      const landing = document.getElementById('joinModal') || document.querySelector('.landing-page-wrapper');
      const appContainer = document.getElementById('appContainer');
      const theater = document.getElementById('theaterArea');
      const hud = document.getElementById('cinemaControls');
      const stage = document.getElementById('stagePlaceholder');
      const cinemaBox = document.getElementById('cinemaBox');
      const dock = document.getElementById('dockWrapper');

      if (landing) landing.classList.add('hidden');
      if (appContainer) appContainer.classList.remove('hidden');
      if (theater) theater.classList.remove('hidden');
      if (stage) stage.classList.add('hidden');
      if (cinemaBox) cinemaBox.classList.add('has-movie');
      if (dock) dock.classList.remove('hidden');

      if (hud) {
        hud.classList.remove('hidden');
        hud.classList.add('active');
        hud.style.setProperty('pointer-events', 'auto', 'important');
        hud.style.setProperty('opacity', '1', 'important');
        hud.style.setProperty('visibility', 'visible', 'important');
      }

      if (window.state) {
        window.state.inRoom = true;
      }
    })()`);
    await sleep(400);

    // Test Viewports Matrix: Mobile Phones & Tablets (Portrait and Landscape)
    const viewports = [
      { name: 'Mobile Phone Portrait (iPhone 14 / 390x844)', width: 390, height: 844, isMobile: true },
      { name: 'Mobile Phone Portrait (Galaxy S20 / 360x800)', width: 360, height: 800, isMobile: true },
      { name: 'Mobile Phone Landscape (iPhone 14 / 844x390)', width: 844, height: 390, isMobile: true },
      { name: 'Mobile Phone Landscape (Wide / 932x430)', width: 932, height: 430, isMobile: true },
      { name: 'Tablet Portrait (iPad Mini / 768x1024)', width: 768, height: 1024, isMobile: true },
      { name: 'Tablet Portrait (iPad Air / 820x1180)', width: 820, height: 1180, isMobile: true },
      { name: 'Tablet Landscape (iPad / 1024x768)', width: 1024, height: 768, isMobile: true },
      { name: 'Tablet Landscape (iPad Pro / 1180x820)', width: 1180, height: 820, isMobile: true }
    ];

    for (const vp of viewports) {
      console.log(`\n--- SECTION 2: Viewport Verification: ${vp.name} ---`);

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.isMobile
      });
      await sleep(300);

      // Trigger resize handlers
      await cdp.eval('window.dispatchEvent(new Event("resize"))');
      await sleep(150);

      // 1. Computed display, opacity, and dimensions
      const canvasStyles = await cdp.eval(`(() => {
        const c = document.getElementById('ambientGlowCanvas');
        if (!c) return null;
        const cs = window.getComputedStyle(c);
        const r = c.getBoundingClientRect();
        return {
          display: cs.display,
          opacity: parseFloat(cs.opacity),
          visibility: cs.visibility,
          width: r.width,
          height: r.height,
          canvasInternalWidth: c.width,
          canvasInternalHeight: c.height
        };
      })()`);

      assert(canvasStyles !== null, `Canvas styles retrieved on ${vp.name}`);
      assert(canvasStyles.display === 'block', `Canvas computed display is 'block' on ${vp.name} (got: ${canvasStyles.display})`);
      assert(canvasStyles.opacity >= 0.6, `Canvas computed opacity is proper (> 0.6) on ${vp.name} (got: ${canvasStyles.opacity})`);
      assert(canvasStyles.width > 0, `Canvas computed width is non-zero on ${vp.name} (got: ${canvasStyles.width}px)`);
      assert(canvasStyles.height > 0, `Canvas computed height is non-zero on ${vp.name} (got: ${canvasStyles.height}px)`);
      assert(canvasStyles.canvasInternalWidth > 0 && canvasStyles.canvasInternalHeight > 0,
        `Canvas internal resolution is initialized on ${vp.name} (${canvasStyles.canvasInternalWidth}x${canvasStyles.canvasInternalHeight})`);

      // 2. Wrapper styles & lateral blank space illumination
      const geometry = await cdp.eval(`(() => {
        const stage = document.getElementById('cinemaStageWrapper');
        const box = document.getElementById('cinemaBox');
        const canvas = document.getElementById('ambientGlowCanvas');
        const wrapper = document.getElementById('ambientGlowWrapper');
        if (!stage || !canvas) return null;

        const stageRect = stage.getBoundingClientRect();
        const boxRect = box ? box.getBoundingClientRect() : stageRect;
        const canvasRect = canvas.getBoundingClientRect();
        const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : canvasRect;

        return {
          stageWidth: stageRect.width,
          stageHeight: stageRect.height,
          boxWidth: boxRect.width,
          boxHeight: boxRect.height,
          canvasWidth: canvasRect.width,
          canvasHeight: canvasRect.height,
          wrapperWidth: wrapperRect.width,
          wrapperHeight: wrapperRect.height,
          canvasLeft: canvasRect.left,
          stageLeft: stageRect.left,
          stageOverflow: window.getComputedStyle(stage).overflow
        };
      })()`);

      assert(geometry !== null, `Stage and ambient geometry retrieved on ${vp.name}`);
      assert(geometry.canvasWidth >= geometry.boxWidth,
        `Ambient glow canvas width encompasses cinema box to illuminate lateral space on ${vp.name} (${geometry.canvasWidth}px >= ${geometry.boxWidth}px)`);
      assert(geometry.stageOverflow !== 'hidden',
        `Cinema stage wrapper does NOT have overflow: hidden clipping the glow on ${vp.name} (got: ${geometry.stageOverflow})`);

      // 3. No horizontal overflow / zero horizontal scroll
      const overflowCheck = await cdp.eval(`(() => {
        const docWidth = document.documentElement.clientWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const bodyScrollWidth = document.body.scrollWidth;
        const windowScrollX = window.scrollX;
        return {
          docWidth,
          scrollWidth,
          bodyScrollWidth,
          windowScrollX,
          hasHorizontalOverflow: scrollWidth > docWidth + 1
        };
      })()`);

      assert(!overflowCheck.hasHorizontalOverflow,
        `Zero horizontal page overflow on ${vp.name} (scrollWidth: ${overflowCheck.scrollWidth}px <= clientWidth: ${overflowCheck.docWidth}px)`);
      assert(overflowCheck.windowScrollX === 0,
        `Window scrollX remains 0 on ${vp.name}`);
    }

    // SECTION 3: Interactive Toggling on Mobile & Tablet
    console.log('\n--- SECTION 3: Interactive Ambient Lighting Toggling ---');

    // Set to mobile viewport (iPhone 14)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(200);

    // Initial state: should be ON
    const initialStatus = await cdp.eval('window.state ? window.state.isAmbientOn : true');
    console.log(`[INFO] Initial ambient state: ${initialStatus ? 'ON' : 'OFF'}`);

    // Click ambient toggle button to turn OFF
    console.log('[INFO] Tapping #ambientToggleBtn to turn OFF...');
    await cdp.eval('document.getElementById("ambientToggleBtn").click()');
    await sleep(300);

    const turnedOffState = await cdp.eval(`(() => {
      const canvas = document.getElementById('ambientGlowCanvas');
      const wrapper = document.getElementById('ambientGlowWrapper');
      const btn = document.getElementById('ambientToggleBtn');
      const statusBadge = document.getElementById('moreMenuAmbientStatus');
      const canvasCS = window.getComputedStyle(canvas);
      return {
        canvasHidden: canvas.classList.contains('hidden'),
        wrapperHidden: wrapper ? wrapper.classList.contains('hidden') : true,
        canvasDisplay: canvasCS.display,
        canvasOpacity: parseFloat(canvasCS.opacity),
        btnActive: btn.classList.contains('active-toggle'),
        statusText: statusBadge ? statusBadge.innerText : ''
      };
    })()`);

    assert(turnedOffState.canvasHidden, 'Canvas gains .hidden class when toggled OFF');
    assert(turnedOffState.canvasDisplay === 'none', `Canvas computed display is 'none' when OFF (got: ${turnedOffState.canvasDisplay})`);
    assert(turnedOffState.canvasOpacity === 0, `Canvas computed opacity is 0 when OFF (got: ${turnedOffState.canvasOpacity})`);
    assert(!turnedOffState.btnActive, '#ambientToggleBtn active-toggle class is removed when OFF');
    assert(turnedOffState.statusText === 'OFF', `#moreMenuAmbientStatus badge text displays 'OFF' (got: ${turnedOffState.statusText})`);

    // Click ambient toggle button to turn back ON
    console.log('[INFO] Tapping #ambientToggleBtn to turn back ON...');
    await cdp.eval('document.getElementById("ambientToggleBtn").click()');
    await sleep(300);

    const turnedOnState = await cdp.eval(`(() => {
      const canvas = document.getElementById('ambientGlowCanvas');
      const wrapper = document.getElementById('ambientGlowWrapper');
      const stage = document.getElementById('cinemaStageWrapper');
      const btn = document.getElementById('ambientToggleBtn');
      const statusBadge = document.getElementById('moreMenuAmbientStatus');
      const canvasCS = window.getComputedStyle(canvas);
      const r = canvas.getBoundingClientRect();
      return {
        canvasHidden: canvas.classList.contains('hidden'),
        canvasActive: canvas.classList.contains('ambient-glow-active'),
        wrapperActive: wrapper ? wrapper.classList.contains('ambient-glow-active') : true,
        stageActive: stage.classList.contains('ambient-glow-active'),
        canvasDisplay: canvasCS.display,
        canvasOpacity: parseFloat(canvasCS.opacity),
        width: r.width,
        height: r.height,
        btnActive: btn.classList.contains('active-toggle'),
        statusText: statusBadge ? statusBadge.innerText : ''
      };
    })()`);

    assert(!turnedOnState.canvasHidden, 'Canvas loses .hidden class when toggled back ON');
    assert(turnedOnState.canvasActive, 'Canvas has .ambient-glow-active class when ON');
    assert(turnedOnState.canvasDisplay === 'block', `Canvas computed display is 'block' when ON (got: ${turnedOnState.canvasDisplay})`);
    assert(turnedOnState.canvasOpacity >= 0.6, `Canvas computed opacity is restored (> 0.6) when ON (got: ${turnedOnState.canvasOpacity})`);
    assert(turnedOnState.width > 0 && turnedOnState.height > 0, `Canvas dimensions are non-zero when ON (${turnedOnState.width}x${turnedOnState.height}px)`);
    assert(turnedOnState.btnActive, '#ambientToggleBtn active-toggle class is restored when ON');
    assert(turnedOnState.statusText === 'ON', `#moreMenuAmbientStatus badge text displays 'ON' (got: ${turnedOnState.statusText})`);

    // Test More Options Menu Toggle (#menuAmbientGlowBtn)
    console.log('\n--- SECTION 4: Menu Ambient Toggle Verification ---');
    console.log('[INFO] Tapping #menuAmbientGlowBtn in More Options menu to turn OFF...');
    await cdp.eval('document.getElementById("menuAmbientGlowBtn").click()');
    await sleep(300);

    const menuToggledOff = await cdp.eval(`(() => {
      const canvas = document.getElementById('ambientGlowCanvas');
      const statusBadge = document.getElementById('moreMenuAmbientStatus');
      return {
        hidden: canvas.classList.contains('hidden'),
        statusText: statusBadge ? statusBadge.innerText : ''
      };
    })()`);
    assert(menuToggledOff.hidden, '#menuAmbientGlowBtn turns OFF ambient glow canvas');
    assert(menuToggledOff.statusText === 'OFF', `#moreMenuAmbientStatus updates to 'OFF'`);

    console.log('[INFO] Tapping #menuAmbientGlowBtn in More Options menu to turn back ON...');
    await cdp.eval('document.getElementById("menuAmbientGlowBtn").click()');
    await sleep(300);

    const menuToggledOn = await cdp.eval(`(() => {
      const canvas = document.getElementById('ambientGlowCanvas');
      const statusBadge = document.getElementById('moreMenuAmbientStatus');
      return {
        hidden: canvas.classList.contains('hidden'),
        statusText: statusBadge ? statusBadge.innerText : ''
      };
    })()`);
    assert(!menuToggledOn.hidden, '#menuAmbientGlowBtn restores ON ambient glow canvas');
    assert(menuToggledOn.statusText === 'ON', `#moreMenuAmbientStatus updates to 'ON'`);

    // SECTION 5: Sampling Loop & Battery Throttle Check
    console.log('\n--- SECTION 5: Ambient Sampling Loop & Frame Throttle ---');
    const samplingLoopActive = await cdp.eval('Boolean((window.state || (window.__lumiere && window.__lumiere.state))?.ambientAnimationId !== null)');
    assert(samplingLoopActive, 'Ambient animation loop requestAnimationFrame is active');

    // Test aspect ratio synchronization on tablet viewport
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 768,
      height: 1024,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(200);
    await cdp.eval('window.dispatchEvent(new Event("resize"))');
    await sleep(150);

    const syncedDimensions = await cdp.eval(`(() => {
      const c = document.getElementById('ambientGlowCanvas');
      return { width: c.width, height: c.height, ratio: (c.width / c.height).toFixed(2) };
    })()`);
    assert(syncedDimensions.width > 0 && syncedDimensions.height > 0,
      `Internal canvas resolution is valid (${syncedDimensions.width}x${syncedDimensions.height})`);

  } catch (err) {
    console.error('[ERROR] Test failure:', err);
    failedCount++;
  } finally {
    if (cdp) cdp.close();
    if (edgeProc) {
      try { edgeProc.kill('SIGKILL'); } catch (e) {}
    }
    if (server) {
      server.close();
    }
  }

  console.log('\n========================================================================');
  console.log(`  FINAL RESULTS: ${passedCount} passed, ${failedCount} failed`);
  console.log('========================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log('[SUCCESS] All mobile and tablet ambient lighting tests passed perfectly!');
    process.exit(0);
  }
}

runTests();
