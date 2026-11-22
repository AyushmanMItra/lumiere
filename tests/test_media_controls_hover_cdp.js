/**
 * TEST SUITE: Movie Screen Media Controls Hover Sound CDP Verification
 * 
 * Verifies that:
 * 1. When the cursor enters any movie screen media control button,
 *    the hover sound effect plays once initially.
 * 2. When the cursor moves inside that button without leaving the button area,
 *    no additional sound effects are played regardless of cursor movement or inner elements.
 * 3. When moving directly from one media control button to an adjacent button,
 *    the sound effect plays once initially for the new button.
 * 4. When the cursor leaves a button and re-enters, the sound effect plays once initially.
 * 
 * Strict No-Emoji Policy: Uses [PASS], [FAIL], [INFO], [SUCCESS] textual tags.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const wsPkg = require('ws');

const PORT = 8205;
const CDP_PORT = 9459;
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
  const tmpDir = path.join(os.tmpdir(), 'edge-hover-cdp-' + Date.now());
  const proc = spawn(EDGE_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=' + CDP_PORT,
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=' + tmpDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-fre',
    '--window-size=1280,800',
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

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
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
  console.log('  TEST SUITE: MEDIA CONTROLS HOVER SOUND CDP VERIFICATION');
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
    await sleep(300);

    // Setup room with active movie mode and reveal cinema HUD controls
    await cdp.eval(`(() => {
      const landing = document.getElementById('joinModal') || document.querySelector('.landing-page-wrapper');
      const appContainer = document.getElementById('appContainer');
      const hud = document.getElementById('cinemaControls');
      const stage = document.getElementById('stagePlaceholder');
      const cinemaBox = document.getElementById('cinemaBox');

      if (landing) landing.classList.add('hidden');
      if (appContainer) appContainer.classList.remove('hidden');
      if (stage) stage.classList.add('hidden');
      if (cinemaBox) cinemaBox.classList.add('has-movie');

      if (hud) {
        hud.classList.remove('hidden');
        hud.classList.add('active');
        hud.style.setProperty('pointer-events', 'auto', 'important');
        hud.style.setProperty('opacity', '1', 'important');
        hud.style.setProperty('visibility', 'visible', 'important');
      }

      // Reveal host-only controls (like rewind10, forward10, stopMovie)
      document.querySelectorAll('.host-only-control, .host-only-btn').forEach(btn => {
        btn.classList.remove('hidden');
      });

      // Instrument playUIAudio to record calls
      window.__hoverSounds = [];
      const origPlay = window.playUIAudio;
      window.playUIAudio = function(type, target) {
        if (type === 'hover') {
          window.__hoverSounds.push({
            time: Date.now(),
            target: target?.id || target?.className || 'unknown'
          });
        }
        if (typeof origPlay === 'function') {
          return origPlay.apply(this, arguments);
        }
      };
    })()`);

    await sleep(200);

    // Helper to get button bounding box in viewport coordinates
    async function getButtonRect(selector) {
      return await cdp.eval(`(() => {
        const el = document.querySelector('${selector}');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      })()`);
    }

    // Helper to move mouse via CDP
    async function moveMouse(x, y) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(x),
        y: Math.round(y)
      });
    }

    // -------------------------------------------------------------------------
    // TEST 1: Rewind 10s button (#rewind10Btn)
    // -------------------------------------------------------------------------
    console.log('[INFO] Testing #rewind10Btn...');
    const rewindRect = await getButtonRect('#rewind10Btn');
    assert(rewindRect && rewindRect.width > 0, '#rewind10Btn is present with non-zero dimensions');

    // Start in center of cinema screen (outside any buttons)
    await moveMouse(600, 200);
    await sleep(100);

    const initialSoundCount = await cdp.eval('window.__hoverSounds.length');
    assert(initialSoundCount === 0, 'Initial hover sound count is 0');

    // Move cursor into #rewind10Btn near top-left of the button
    await moveMouse(rewindRect.left + 8, rewindRect.top + 8);
    await sleep(100);

    const countAfterEnter = await cdp.eval('window.__hoverSounds.length');
    assert(countAfterEnter === 1, `Sound played exactly once on entering #rewind10Btn (got: ${countAfterEnter})`);

    // Move cursor across multiple internal points inside #rewind10Btn without leaving the button area
    // Pause 60ms between each move to exceed the 45ms audio throttle
    const internalPoints = [
      { x: rewindRect.left + 10, y: rewindRect.top + 10 },
      { x: rewindRect.left + 14, y: rewindRect.top + 14 },
      { x: rewindRect.left + 17, y: rewindRect.top + 17 }, // over text and path
      { x: rewindRect.left + 22, y: rewindRect.top + 14 },
      { x: rewindRect.left + 26, y: rewindRect.top + 20 },
      { x: rewindRect.left + 20, y: rewindRect.top + 24 },
      { x: rewindRect.left + 12, y: rewindRect.top + 22 },
      { x: rewindRect.left + 8, y: rewindRect.top + 15 },
      { x: rewindRect.left + 16, y: rewindRect.top + 16 }
    ];

    for (const pt of internalPoints) {
      await moveMouse(pt.x, pt.y);
      await sleep(60);
    }

    const countAfterInternalMoves = await cdp.eval('window.__hoverSounds.length');
    assert(countAfterInternalMoves === 1, 
      `Moving inside #rewind10Btn did NOT play additional sound effects (expected 1, got: ${countAfterInternalMoves})`);

    // -------------------------------------------------------------------------
    // TEST 2: Move directly to adjacent button #forward10Btn
    // -------------------------------------------------------------------------
    console.log('[INFO] Testing transition to adjacent button #forward10Btn...');
    const forwardRect = await getButtonRect('#forward10Btn');
    assert(forwardRect && forwardRect.width > 0, '#forward10Btn is present with non-zero dimensions');

    // Move directly into #forward10Btn
    await moveMouse(forwardRect.left + 10, forwardRect.top + 10);
    await sleep(100);

    const countAfterAdjacentEnter = await cdp.eval('window.__hoverSounds.length');
    assert(countAfterAdjacentEnter === 2, 
      `Entering adjacent button #forward10Btn played sound once (expected 2, got: ${countAfterAdjacentEnter})`);

    // Move cursor inside #forward10Btn across inner child elements
    const forwardInternalPoints = [
      { x: forwardRect.left + 12, y: forwardRect.top + 12 },
      { x: forwardRect.left + 17, y: forwardRect.top + 17 },
      { x: forwardRect.left + 20, y: forwardRect.top + 18 },
      { x: forwardRect.left + 24, y: forwardRect.top + 14 },
      { x: forwardRect.left + 18, y: forwardRect.top + 22 },
      { x: forwardRect.left + 10, y: forwardRect.top + 18 }
    ];

    for (const pt of forwardInternalPoints) {
      await moveMouse(pt.x, pt.y);
      await sleep(60);
    }

    const countAfterForwardMoves = await cdp.eval('window.__hoverSounds.length');
    assert(countAfterForwardMoves === 2, 
      `Moving inside #forward10Btn did NOT play additional sound effects (expected 2, got: ${countAfterForwardMoves})`);

    // -------------------------------------------------------------------------
    // TEST 3: Leave button and re-enter
    // -------------------------------------------------------------------------
    console.log('[INFO] Testing leave and re-enter behavior...');
    // Move outside far away into neutral stage area (100, 100)
    await moveMouse(100, 100);
    await sleep(150);

    const countInNeutral = await cdp.eval('window.__hoverSounds.length');
    assert(countInNeutral === 2, `Moving outside button did not trigger extra sound (got: ${countInNeutral})`);

    // Re-enter #forward10Btn
    const freshForwardRect = await getButtonRect('#forward10Btn');
    await moveMouse(freshForwardRect.left + freshForwardRect.width / 2, freshForwardRect.top + freshForwardRect.height / 2);
    await sleep(150);

    const countAfterReenter = await cdp.eval('window.__hoverSounds.length');
    assert(countAfterReenter === 3, 
      `Re-entering #forward10Btn played sound once initially (expected 3, got: ${countAfterReenter})`);

    // Move inside again
    await moveMouse(freshForwardRect.left + freshForwardRect.width / 2 + 2, freshForwardRect.top + freshForwardRect.height / 2 + 2);
    await sleep(60);
    await moveMouse(freshForwardRect.left + freshForwardRect.width / 2 - 2, freshForwardRect.top + freshForwardRect.height / 2 - 2);
    await sleep(60);

    const countAfterReenterMoves = await cdp.eval('window.__hoverSounds.length');
    assert(countAfterReenterMoves === 3, 
      `Moving inside after re-entering did not play extra sound (expected 3, got: ${countAfterReenterMoves})`);

    // -------------------------------------------------------------------------
    // TEST 4: Ambient cinema glow toggle button (#ambientToggleBtn)
    // Has multi-ray SVG children
    // -------------------------------------------------------------------------
    console.log('[INFO] Testing #ambientToggleBtn with multi-ray SVG children...');
    const ambientRect = await getButtonRect('#ambientToggleBtn');
    assert(ambientRect && ambientRect.width > 0, '#ambientToggleBtn is present with non-zero dimensions');

    await moveMouse(ambientRect.left + 10, ambientRect.top + 10);
    await sleep(100);

    const countAmbientEnter = await cdp.eval('window.__hoverSounds.length');
    assert(countAmbientEnter === 4, 
      `Entering #ambientToggleBtn played sound once initially (expected 4, got: ${countAmbientEnter})`);

    // Move cursor across rays inside ambient toggle button
    const ambientPoints = [
      { x: ambientRect.left + 12, y: ambientRect.top + 12 },
      { x: ambientRect.left + 17, y: ambientRect.top + 17 },
      { x: ambientRect.left + 24, y: ambientRect.top + 14 },
      { x: ambientRect.left + 20, y: ambientRect.top + 22 },
      { x: ambientRect.left + 14, y: ambientRect.top + 24 },
      { x: ambientRect.left + 10, y: ambientRect.top + 16 }
    ];

    for (const pt of ambientPoints) {
      await moveMouse(pt.x, pt.y);
      await sleep(60);
    }

    const countAmbientMoves = await cdp.eval('window.__hoverSounds.length');
    assert(countAmbientMoves === 4, 
      `Moving inside #ambientToggleBtn across SVG rays did NOT play extra sound (expected 4, got: ${countAmbientMoves})`);

    // -------------------------------------------------------------------------
    // TEST 5: Play/Pause circular button (#playPauseBtn)
    // -------------------------------------------------------------------------
    console.log('[INFO] Testing #playPauseBtn circular button...');
    const playPauseRect = await getButtonRect('#playPauseBtn');
    assert(playPauseRect && playPauseRect.width > 0, '#playPauseBtn is present with non-zero dimensions');

    await moveMouse(playPauseRect.left + 15, playPauseRect.top + 15);
    await sleep(100);

    const countPlayPauseEnter = await cdp.eval('window.__hoverSounds.length');
    assert(countPlayPauseEnter === 5, 
      `Entering #playPauseBtn played sound once initially (expected 5, got: ${countPlayPauseEnter})`);

    // Move in circular path inside playPauseBtn
    const centerX = playPauseRect.left + playPauseRect.width / 2;
    const centerY = playPauseRect.top + playPauseRect.height / 2;
    const radius = 10;
    for (let angle = 0; angle < 360; angle += 45) {
      const rad = (angle * Math.PI) / 180;
      await moveMouse(centerX + radius * Math.cos(rad), centerY + radius * Math.sin(rad));
      await sleep(60);
    }

    const countPlayPauseMoves = await cdp.eval('window.__hoverSounds.length');
    assert(countPlayPauseMoves === 5, 
      `Moving in circular path inside #playPauseBtn did NOT play extra sound (expected 5, got: ${countPlayPauseMoves})`);

    // -------------------------------------------------------------------------
    // TEST 6: Stop movie button (#stopMovieBtn)
    // -------------------------------------------------------------------------
    console.log('[INFO] Testing #stopMovieBtn...');
    const stopRect = await getButtonRect('#stopMovieBtn');
    assert(stopRect && stopRect.width > 0, '#stopMovieBtn is present with non-zero dimensions');

    await moveMouse(stopRect.left + 10, stopRect.top + 10);
    await sleep(100);

    const countStopEnter = await cdp.eval('window.__hoverSounds.length');
    assert(countStopEnter === 6, 
      `Entering #stopMovieBtn played sound once initially (expected 6, got: ${countStopEnter})`);

    await moveMouse(stopRect.left + 16, stopRect.top + 16);
    await sleep(60);
    await moveMouse(stopRect.left + 22, stopRect.top + 14);
    await sleep(60);

    const countStopMoves = await cdp.eval('window.__hoverSounds.length');
    assert(countStopMoves === 6, 
      `Moving inside #stopMovieBtn did NOT play extra sound (expected 6, got: ${countStopMoves})`);

    // -------------------------------------------------------------------------
    // TEST 7: Volume toggle button (#volumeToggleBtn)
    // -------------------------------------------------------------------------
    console.log('[INFO] Testing #volumeToggleBtn...');
    const volRect = await getButtonRect('#volumeToggleBtn');
    assert(volRect && volRect.width > 0, '#volumeToggleBtn is present with non-zero dimensions');

    await moveMouse(volRect.left + 10, volRect.top + 10);
    await sleep(100);

    const countVolEnter = await cdp.eval('window.__hoverSounds.length');
    assert(countVolEnter === 7, 
      `Entering #volumeToggleBtn played sound once initially (expected 7, got: ${countVolEnter})`);

    await moveMouse(volRect.left + 16, volRect.top + 16);
    await sleep(60);
    await moveMouse(volRect.left + 20, volRect.top + 14);
    await sleep(60);

    const countVolMoves = await cdp.eval('window.__hoverSounds.length');
    assert(countVolMoves === 7, 
      `Moving inside #volumeToggleBtn did NOT play extra sound (expected 7, got: ${countVolMoves})`);

    // -------------------------------------------------------------------------
    // TEST 8: Subtitle settings button (#subtitleSettingsBtn)
    // -------------------------------------------------------------------------
    console.log('[INFO] Testing #subtitleSettingsBtn...');
    const subRect = await getButtonRect('#subtitleSettingsBtn');
    assert(subRect && subRect.width > 0, '#subtitleSettingsBtn is present with non-zero dimensions');

    await moveMouse(subRect.left + 8, subRect.top + 8);
    await sleep(100);

    const countSubEnter = await cdp.eval('window.__hoverSounds.length');
    assert(countSubEnter === 8, 
      `Entering #subtitleSettingsBtn played sound once initially (expected 8, got: ${countSubEnter})`);

    await moveMouse(subRect.left + 10, subRect.top + 10);
    await sleep(60);
    await moveMouse(subRect.left + 12, subRect.top + 12);
    await sleep(60);

    const countSubMoves = await cdp.eval('window.__hoverSounds.length');
    assert(countSubMoves === 8, 
      `Moving inside #subtitleSettingsBtn did NOT play extra sound (expected 8, got: ${countSubMoves})`);

    // -------------------------------------------------------------------------
    // TEST 9: Fullscreen button (#hudFullscreenBtn)
    // -------------------------------------------------------------------------
    console.log('[INFO] Testing #hudFullscreenBtn...');
    const fsRect = await getButtonRect('#hudFullscreenBtn');
    assert(fsRect && fsRect.width > 0, '#hudFullscreenBtn is present with non-zero dimensions');

    await moveMouse(fsRect.left + 10, fsRect.top + 10);
    await sleep(100);

    const countFsEnter = await cdp.eval('window.__hoverSounds.length');
    assert(countFsEnter === 9, 
      `Entering #hudFullscreenBtn played sound once initially (expected 9, got: ${countFsEnter})`);

    await moveMouse(fsRect.left + 16, fsRect.top + 16);
    await sleep(60);
    await moveMouse(fsRect.left + 20, fsRect.top + 14);
    await sleep(60);

    const countFsMoves = await cdp.eval('window.__hoverSounds.length');
    assert(countFsMoves === 9, 
      `Moving inside #hudFullscreenBtn did NOT play extra sound (expected 9, got: ${countFsMoves})`);

    // -------------------------------------------------------------------------
    // TEST 10: Picture in Picture button (#pipBtn)
    // -------------------------------------------------------------------------
    console.log('[INFO] Testing #pipBtn...');
    const pipRect = await getButtonRect('#pipBtn');
    assert(pipRect && pipRect.width > 0, '#pipBtn is present with non-zero dimensions');

    await moveMouse(pipRect.left + 10, pipRect.top + 10);
    await sleep(100);

    const countPipEnter = await cdp.eval('window.__hoverSounds.length');
    assert(countPipEnter === 10, 
      `Entering #pipBtn played sound once initially (expected 10, got: ${countPipEnter})`);

    await moveMouse(pipRect.left + 14, pipRect.top + 14);
    await sleep(60);
    await moveMouse(pipRect.left + 18, pipRect.top + 18);
    await sleep(60);

    const countPipMoves = await cdp.eval('window.__hoverSounds.length');
    assert(countPipMoves === 10, 
      `Moving inside #pipBtn did NOT play extra sound (expected 10, got: ${countPipMoves})`);

    // -------------------------------------------------------------------------
    // TEST 11: Mini-Player Play/Pause button (#miniPlayerPlayPauseBtn)
    // -------------------------------------------------------------------------
    console.log('[INFO] Testing #miniPlayerPlayPauseBtn in mini-player mode...');
    await cdp.eval(`(() => {
      const miniOverlay = document.getElementById('miniPlayerControls');
      if (miniOverlay) {
        miniOverlay.style.display = 'flex';
        miniOverlay.style.visibility = 'visible';
        miniOverlay.style.opacity = '1';
        miniOverlay.style.position = 'fixed';
        miniOverlay.style.top = '100px';
        miniOverlay.style.left = '100px';
        miniOverlay.style.width = '200px';
        miniOverlay.style.height = '60px';
        miniOverlay.style.zIndex = '99999';
        miniOverlay.style.setProperty('pointer-events', 'auto', 'important');
      }
    })()`);
    await sleep(150);

    const miniPlayRect = await getButtonRect('#miniPlayerPlayPauseBtn');
    assert(miniPlayRect && miniPlayRect.width > 0, '#miniPlayerPlayPauseBtn is present with non-zero dimensions');

    await moveMouse(miniPlayRect.left + 8, miniPlayRect.top + 8);
    await sleep(100);

    const countMiniPlayEnter = await cdp.eval('window.__hoverSounds.length');
    assert(countMiniPlayEnter === 11, 
      `Entering #miniPlayerPlayPauseBtn played sound once initially (expected 11, got: ${countMiniPlayEnter})`);

    await moveMouse(miniPlayRect.left + 12, miniPlayRect.top + 12);
    await sleep(60);
    await moveMouse(miniPlayRect.left + 16, miniPlayRect.top + 14);
    await sleep(60);

    const countMiniPlayMoves = await cdp.eval('window.__hoverSounds.length');
    assert(countMiniPlayMoves === 11, 
      `Moving inside #miniPlayerPlayPauseBtn did NOT play extra sound (expected 11, got: ${countMiniPlayMoves})`);

    console.log('\n========================================================================');
    console.log(`  SUMMARY: ${passedCount} CHECKS PASSED, ${failedCount} FAILED`);
    console.log('========================================================================\n');

    if (failedCount > 0) {
      process.exitCode = 1;
    }

  } catch (err) {
    console.error('[ERROR] Test failed with exception:', err);
    process.exitCode = 1;
  } finally {
    if (edgeInfo?.proc) {
      try {
        process.kill(edgeInfo.proc.pid);
        fs.rmSync(edgeInfo.tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
    if (server) {
      server.close();
    }
    process.exit(process.exitCode || 0);
  }
}

runTests();
