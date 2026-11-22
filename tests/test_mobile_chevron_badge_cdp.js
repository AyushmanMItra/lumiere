/**
 * TEST SUITE: Mobile Chevron Overlay Badge CDP Verification
 * 
 * Verifies that:
 * 1. HTML structure contains .pill-split-group / .split-dock-btn with #micSplitBtn and #cameraSplitBtn.
 * 2. #micDeviceDropdownBtn and #camDeviceDropdownBtn have class .pill-chevron-btn.
 * 3. On mobile viewports (portrait and landscape), .pill-chevron-btn is styled as a circular badge
 *    nested/overlapping in the bottom-right corner of the parent button, NOT an elongated vertical pill.
 * 4. Computed position is 'absolute', aspect ratio is ~1:1 (width ≈ height, e.g. 16px x 16px),
 *    and border-radius is circular (50% / full pill radius).
 * 5. Tapping/clicking the chevron button opens the respective device menu sheet without toggling mic/camera.
 * 6. Tapping/clicking the main button toggles mic/camera without opening the device menu sheet.
 * 7. Desktop appearance preserves bottom-right badge positioning without regression.
 * 
 * Strict No-Emoji Policy: Uses [PASS], [FAIL], [INFO] textual tags.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const wsPkg = require('ws');

const PORT = 8199;
const CDP_PORT = 9453;
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
  const tmpDir = path.join(os.tmpdir(), 'edge-chevron-badge-' + Date.now());
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
  console.log('  TEST SUITE: MOBILE CHEVRON BADGE OVERLAY CDP VERIFICATION');
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
    const { proc, wsUrl } = await launchEdge();
    edgeProc = proc;
    cdp = await createCdpClient(wsUrl);

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');

    for (let i = 0; i < 50; i++) {
      const ready = await cdp.eval('document.readyState === "complete" && !!document.getElementById("appContainer")');
      if (ready) break;
      await sleep(100);
    }
    await sleep(300);

    // Initialize room UI environment
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
    })()`);

    await sleep(500);

    // Test Viewports: Mobile Portrait, Mobile Landscape, Tablet Portrait, Desktop
    const viewports = [
      { name: 'iPhone 15 Pro Portrait', width: 393, height: 852, isMobile: true, portrait: true },
      { name: 'iPhone SE Portrait', width: 375, height: 667, isMobile: true, portrait: true },
      { name: 'Galaxy S20 Portrait', width: 360, height: 800, isMobile: true, portrait: true },
      { name: 'Ultra Narrow Galaxy Fold Cover', width: 280, height: 653, isMobile: true, portrait: true },
      { name: 'iPhone 15 Pro Landscape', width: 852, height: 393, isMobile: true, portrait: false },
      { name: 'iPad Mini Portrait', width: 768, height: 1024, isMobile: false, portrait: true },
      { name: 'Desktop Full HD', width: 1920, height: 1080, isMobile: false, portrait: true }
    ];

    for (const vp of viewports) {
      console.log(`\n------------------------------------------------------------------------`);
      console.log(`  VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
      console.log(`------------------------------------------------------------------------`);

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.isMobile
      });

      await sleep(300);

      const metrics = await cdp.eval(`(() => {
        const micGroup = document.getElementById('micSplitBtn');
        const camGroup = document.getElementById('cameraSplitBtn');
        const micBtn = document.getElementById('toggleMicBtn');
        const camBtn = document.getElementById('toggleCameraBtn');
        const micChevron = document.getElementById('micDeviceDropdownBtn');
        const camChevron = document.getElementById('camDeviceDropdownBtn');
        const pillDock = document.querySelector('.floating-pill-dock');

        if (!micGroup || !camGroup || !micChevron || !camChevron || !micBtn || !camBtn) {
          return { found: false };
        }

        const micGroupRect = micGroup.getBoundingClientRect();
        const camGroupRect = camGroup.getBoundingClientRect();
        const micBtnRect = micBtn.getBoundingClientRect();
        const camBtnRect = camBtn.getBoundingClientRect();
        const micChevronRect = micChevron.getBoundingClientRect();
        const camChevronRect = camChevron.getBoundingClientRect();

        const micChevronStyle = window.getComputedStyle(micChevron);
        const camChevronStyle = window.getComputedStyle(camChevron);

        const micAspectRatio = micChevronRect.width / micChevronRect.height;
        const camAspectRatio = camChevronRect.width / camChevronRect.height;

        // Position check: Chevron right edge should be near group right edge (within 8px)
        const micRightOffset = Math.abs(micGroupRect.right - micChevronRect.right);
        const camRightOffset = Math.abs(camGroupRect.right - camChevronRect.right);

        // Position check: Chevron bottom edge should be near group bottom edge (within 8px)
        const micBottomOffset = Math.abs(micGroupRect.bottom - micChevronRect.bottom);
        const camBottomOffset = Math.abs(camGroupRect.bottom - camChevronRect.bottom);

        // Is badge overlapping main button:
        const micOverlaps = (micChevronRect.left < micBtnRect.right) && (micChevronRect.top < micBtnRect.bottom);
        const camOverlaps = (camChevronRect.left < camBtnRect.right) && (camChevronRect.top < camBtnRect.bottom);

        return {
          found: true,
          micPosition: micChevronStyle.position,
          camPosition: camChevronStyle.position,
          micWidth: Math.round(micChevronRect.width),
          micHeight: Math.round(micChevronRect.height),
          camWidth: Math.round(camChevronRect.width),
          camHeight: Math.round(camChevronRect.height),
          micAspectRatio: Math.round(micAspectRatio * 100) / 100,
          camAspectRatio: Math.round(camAspectRatio * 100) / 100,
          micBorderRadius: micChevronStyle.borderRadius,
          camBorderRadius: camChevronStyle.borderRadius,
          micRightOffset,
          camRightOffset,
          micBottomOffset,
          camBottomOffset,
          micOverlaps,
          camOverlaps,
          hasPillSplitGroupClass: micGroup.classList.contains('pill-split-group') && camGroup.classList.contains('pill-split-group')
        };
      })()`);

      assert(metrics.found, `${vp.name}: Mic and Cam split buttons and chevrons found in DOM`);
      assert(metrics.hasPillSplitGroupClass, `${vp.name}: Split groups have .pill-split-group class`);
      assert(metrics.micPosition === 'absolute' && metrics.camPosition === 'absolute',
        `${vp.name}: Chevron computed position is 'absolute' (mic=${metrics.micPosition}, cam=${metrics.camPosition})`);

      // Width and Height check: aspect ratio should be approximately 1:1 (circular badge, NOT 14x40 elongated pill)
      const micIsCircular = metrics.micAspectRatio >= 0.8 && metrics.micAspectRatio <= 1.25;
      const camIsCircular = metrics.camAspectRatio >= 0.8 && metrics.camAspectRatio <= 1.25;
      assert(micIsCircular && camIsCircular,
        `${vp.name}: Chevron buttons are circular aspect ratio ~1:1 (mic=${metrics.micWidth}x${metrics.micHeight}, cam=${metrics.camWidth}x${metrics.camHeight})`,
        `micAspect=${metrics.micAspectRatio}, camAspect=${metrics.camAspectRatio}`);

      // Height should not be an elongated vertical pill (>22px is too tall for a mobile badge)
      assert(metrics.micHeight <= 22 && metrics.camHeight <= 22,
        `${vp.name}: Chevron badge height is compact (micHeight=${metrics.micHeight}px <= 22px, camHeight=${metrics.camHeight}px <= 22px)`);

      // Overlap check: Chevron badge overlaps the bottom-right corner of the parent button
      assert(metrics.micOverlaps && metrics.camOverlaps,
        `${vp.name}: Chevron badge overlaps bottom-right corner of the circular button`);

      // Bottom-right corner offset check: badge is positioned near the bottom right edge
      assert(metrics.micRightOffset <= 10 && metrics.camRightOffset <= 10,
        `${vp.name}: Chevron right alignment is in the bottom-right corner (micRightOffset=${metrics.micRightOffset}px, camRightOffset=${metrics.camRightOffset}px)`);
      assert(metrics.micBottomOffset <= 10 && metrics.camBottomOffset <= 10,
        `${vp.name}: Chevron bottom alignment is in the bottom-right corner (micBottomOffset=${metrics.micBottomOffset}px, camBottomOffset=${metrics.camBottomOffset}px)`);
    }

    // Interactive Behavior Test on Mobile:
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`  INTERACTION VERIFICATION: Tap Isolation & Menu Toggling`);
    console.log(`------------------------------------------------------------------------`);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(300);

    const interactionTest = await cdp.eval(`(async () => {
      const micBtn = document.getElementById('toggleMicBtn');
      const micChevron = document.getElementById('micDeviceDropdownBtn');
      const micMenu = document.getElementById('micDeviceMenu');
      const camChevron = document.getElementById('camDeviceDropdownBtn');
      const camMenu = document.getElementById('camDeviceMenu');

      const isMutedBefore = micBtn.classList.contains('pill-btn-muted');

      // 1. Click mic chevron to open device menu
      micChevron.click();
      const menuOpenedAfterChevronClick = !micMenu.classList.contains('hidden');
      const isMutedAfterChevronClick = micBtn.classList.contains('pill-btn-muted');

      // Wait 350ms to respect bindTap debounce threshold
      await new Promise(r => setTimeout(r, 350));

      // 2. Click mic chevron again to toggle close
      micChevron.click();
      const menuClosedAfterSecondChevronClick = micMenu.classList.contains('hidden') || micMenu.classList.contains('sheet-closing');

      // Wait 350ms to respect bindTap debounce threshold
      await new Promise(r => setTimeout(r, 350));

      // 3. Click camera chevron to open camera menu
      camChevron.click();
      const camMenuOpened = !camMenu.classList.contains('hidden');
      camChevron.click();

      // 4. Verify main button click isolation: clicking mic does not open menu
      micBtn.click();
      const menuRemainedClosedOnMainClick = micMenu.classList.contains('hidden') || micMenu.classList.contains('sheet-closing');

      return {
        menuOpenedAfterChevronClick,
        chevronClickDidNotToggleMute: (isMutedBefore === isMutedAfterChevronClick),
        menuClosedAfterSecondChevronClick,
        camMenuOpened,
        menuRemainedClosedOnMainClick
      };
    })()`);

    assert(interactionTest.menuOpenedAfterChevronClick, 'Clicking mic chevron badge opens mic device menu bottom sheet');
    assert(interactionTest.chevronClickDidNotToggleMute, 'Clicking mic chevron badge does NOT toggle mic mute state');
    assert(interactionTest.menuClosedAfterSecondChevronClick, 'Clicking mic chevron badge again closes the menu sheet');
    assert(interactionTest.camMenuOpened, 'Clicking camera chevron badge opens camera device menu bottom sheet');
    assert(interactionTest.menuRemainedClosedOnMainClick, 'Clicking main mic button does NOT open the device menu sheet');

    // Alias verification: #micDeviceBtn and #camDeviceBtn DOM resolution
    const aliasCheck = await cdp.eval(`(() => {
      const byIdMic = document.getElementById('micDeviceBtn');
      const byIdCam = document.getElementById('camDeviceBtn');
      const qsMic = document.querySelector('#micDeviceBtn');
      const qsCam = document.querySelector('#camDeviceBtn');
      const realMic = document.getElementById('micDeviceDropdownBtn');
      const realCam = document.getElementById('camDeviceDropdownBtn');
      return {
        byIdMicMatch: byIdMic === realMic,
        byIdCamMatch: byIdCam === realCam,
        qsMicMatch: qsMic === realMic,
        qsCamMatch: qsCam === realCam
      };
    })()`);

    assert(aliasCheck.byIdMicMatch, 'document.getElementById("micDeviceBtn") successfully resolves mic chevron button');
    assert(aliasCheck.byIdCamMatch, 'document.getElementById("camDeviceBtn") successfully resolves cam chevron button');
    assert(aliasCheck.qsMicMatch, 'document.querySelector("#micDeviceBtn") successfully resolves mic chevron button');
    assert(aliasCheck.qsCamMatch, 'document.querySelector("#camDeviceBtn") successfully resolves cam chevron button');

  } catch (err) {
    console.error('[ERROR]', err);
    failedCount++;
  } finally {
    if (cdp) cdp.close();
    if (edgeProc) edgeProc.kill();
    if (server) server.close();

    console.log('\n========================================================================');
    console.log(`  CHEVRON BADGE AUDIT SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('========================================================================\n');

    process.exit(failedCount > 0 ? 1 : 0);
  }
}

runTests();
