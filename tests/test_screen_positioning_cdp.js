/**
 * TEST SUITE: Screen Layout, Proportions, and Element Positioning CDP Verification
 *
 * Verifies the 4 pinpointed layout overhaul areas across all devices:
 * 1. Action Dock and Participant Webcam Tile: Zero overlap and dedicated vertical clearance gap.
 * 2. Corner Elements Sweet Spot: #dockInviteBtn, #theaterFullscreenBtn, .top-bar-left, #topChatBtn
 *    positioned in balanced corner sweet spots without being pushed hundreds of pixels inward or into bezels.
 * 3. Cinema Stage Lounge Box Expansion: .stage-lounge-card, avatar, typography, and CTA button scaled
 *    proportionately across PC, Tablet, and Mobile.
 * 4. Lateral Blank Space Elimination: Ambient atmospheric glow and responsive cinema stage frame scaling.
 * 5. Strict Zero-Emoji Policy: 0 emojis across source files and test suite.
 *
 * Strict No-Emoji Policy: Uses [PASS], [FAIL], [INFO], [SUCCESS] textual tags.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const wsPkg = require('ws');

const PORT = 8245;
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
  const tmpDir = path.join(os.tmpdir(), 'edge-positioning-' + Date.now());
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
    ws.on('message', raw => {
      const data = JSON.parse(raw.toString());
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    });
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
    return res.result ? res.result.value : null;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runPositioningAudit() {
  console.log('========================================================================');
  console.log('  SCREEN LAYOUT, PROPORTIONS & ELEMENT POSITIONING CDP VERIFICATION     ');
  console.log('========================================================================\n');

  let server;
  let edgeInfo;
  let passedCount = 0;
  let failedCount = 0;
  const failureLog = [];

  function assert(condition, testName, details = '') {
    if (condition) {
      passedCount++;
      console.log(`  [PASS] ${testName}${details ? ' (' + details + ')' : ''}`);
    } else {
      failedCount++;
      const msg = `[FAIL] ${testName}${details ? ' (' + details + ')' : ''}`;
      console.error(`  ${msg}`);
      failureLog.push(msg);
    }
  }

  try {
    server = await startStaticServer();
    edgeInfo = await launchEdge();
    const wsUrl = await getPageWSUrl();
    const ws = new wsPkg(wsUrl);
    await new Promise(res => { ws.on('open', res); });
    const cdp = new CDPClient(ws);

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');

    for (let i = 0; i < 50; i++) {
      const ready = await cdp.eval('document.readyState === "complete" && !!document.body && !!document.getElementById("appContainer")');
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
      const stripArea = document.getElementById('participantStripArea');
      const cinemaGroup = document.getElementById('stageCinemaGroup');
      const strip = document.getElementById('participantStrip');

      if (landing) landing.classList.add('hidden');
      if (appContainer) appContainer.classList.remove('hidden');
      if (theater) theater.classList.remove('hidden');
      if (hud) hud.classList.remove('hidden');
      if (stage) stage.classList.remove('hidden');
      if (dock) dock.classList.remove('hidden');

      if (stripArea) {
        stripArea.classList.remove('hidden');
        stripArea.dataset.count = '1';
      }
      if (cinemaGroup) {
        cinemaGroup.dataset.participantCount = '1';
      }

      if (strip && !document.getElementById('testParticipantTile')) {
        const card = document.createElement('div');
        card.className = 'participant-tile';
        card.id = 'testParticipantTile';
        card.innerHTML = '<div class="tile-avatar-center">A</div><div class="tile-name-badge">Alex (Host)</div>';
        strip.appendChild(card);
      }
      document.body.classList.add('has-participants');
    })()`);

    // Master test matrix across device form factors
    const testViewports = [
      { name: 'Desktop Full HD (1920x1080)', w: 1920, h: 1080, dpr: 1.0, mobile: false, type: 'desktop' },
      { name: 'Desktop Standard (1440x900)', w: 1440, h: 900, dpr: 1.0, mobile: false, type: 'desktop' },
      { name: 'Laptop Standard (1366x768)', w: 1366, h: 768, dpr: 1.0, mobile: false, type: 'laptop' },
      { name: 'Laptop 16:10 (1280x800)', w: 1280, h: 800, dpr: 1.0, mobile: false, type: 'laptop' },
      { name: 'Desktop Compact (1024x768)', w: 1024, h: 768, dpr: 1.0, mobile: false, type: 'laptop' },
      { name: 'iPad Pro 13 (1024x1366)', w: 1024, h: 1366, dpr: 2.0, mobile: true, type: 'tablet' },
      { name: 'iPad Mini (768x1024)', w: 768, h: 1024, dpr: 2.0, mobile: true, type: 'tablet' },
      { name: 'Galaxy Tab (800x1280)', w: 800, h: 1280, dpr: 1.5, mobile: true, type: 'tablet' },
      { name: 'iPhone 15 Pro (393x852)', w: 393, h: 852, dpr: 3.0, mobile: true, type: 'phone_portrait' },
      { name: 'Pixel 8 (412x892)', w: 412, h: 892, dpr: 2.625, mobile: true, type: 'phone_portrait' },
      { name: 'iPhone SE (375x667)', w: 375, h: 667, dpr: 2.0, mobile: true, type: 'phone_portrait' },
      { name: 'iPhone 15 Landscape (852x393)', w: 852, h: 393, dpr: 3.0, mobile: true, type: 'phone_landscape' },
      { name: 'Pixel 8 Landscape (892x412)', w: 892, h: 412, dpr: 2.625, mobile: true, type: 'phone_landscape' },
      { name: 'Galaxy Z Fold 5 Unfolded (832x768)', w: 832, h: 768, dpr: 2.625, mobile: true, type: 'foldable' },
      { name: 'Surface Duo Dual (1114x720)', w: 1114, h: 720, dpr: 2.5, mobile: true, type: 'foldable' }
    ];

    console.log('------------------------------------------------------------------------');
    console.log('  SUITE 1: WEBCAM TILE & ACTION DOCK ZERO-OVERLAP & BREATHING CLEARANCE ');
    console.log('------------------------------------------------------------------------\n');

    for (const vp of testViewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile
      });
      await sleep(80);

      const metrics = await cdp.eval(`(() => {
        const tile = document.getElementById('testParticipantTile');
        const dock = document.querySelector('.floating-pill-dock');
        const stripArea = document.getElementById('participantStripArea');

        if (!tile || !dock) return null;
        const tRect = tile.getBoundingClientRect();
        const dRect = dock.getBoundingClientRect();
        const sRect = stripArea ? stripArea.getBoundingClientRect() : null;

        const overlapsWithPillDock = (
          tRect.bottom > dRect.top &&
          tRect.top < dRect.bottom &&
          tRect.right > dRect.left &&
          tRect.left < dRect.right
        );

        const verticalGap = dRect.top - tRect.bottom;
        const isSideBySide = (tRect.right <= dRect.left || tRect.left >= dRect.right);

        return {
          tileTop: tRect.top,
          tileBottom: tRect.bottom,
          tileHeight: tRect.height,
          dockTop: dRect.top,
          dockBottom: dRect.bottom,
          overlapsWithPillDock,
          verticalGap: Math.round(verticalGap),
          isSideBySide,
          tileVisible: tRect.width > 0 && tRect.height > 0
        };
      })()`);

      assert(metrics && !metrics.overlapsWithPillDock, `${vp.name}: Zero bounding-box overlap between webcam tile and action dock`);
      if (metrics && !metrics.isSideBySide) {
        assert(metrics.verticalGap >= 12, `${vp.name}: Dedicated vertical clearance gap between webcam tile and dock`, `gap=${metrics.verticalGap}px >= 12px`);
      }
      assert(metrics && metrics.tileVisible, `${vp.name}: Participant webcam tile fully visible and rendered`);
    }

    console.log('\n------------------------------------------------------------------------');
    console.log('  SUITE 2: FOUR-CORNER CONTROLS BALANCED SWEET SPOT ANCHORING          ');
    console.log('------------------------------------------------------------------------\n');

    for (const vp of testViewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile
      });
      await sleep(80);

      const corners = await cdp.eval(`(() => {
        const invBtn = document.getElementById('dockInviteBtn');
        const fsBtn = document.getElementById('theaterFullscreenBtn');
        const brand = document.querySelector('.top-bar-left') || document.getElementById('roomTitleDisplay');
        const chatBtn = document.getElementById('topChatBtn');

        const iRect = invBtn ? invBtn.getBoundingClientRect() : null;
        const fRect = (fsBtn && getComputedStyle(fsBtn).display !== 'none') ? fsBtn.getBoundingClientRect() : null;
        const bRect = brand ? brand.getBoundingClientRect() : null;
        const cRect = chatBtn ? chatBtn.getBoundingClientRect() : null;

        const winW = window.innerWidth;
        const winH = window.innerHeight;

        return {
          invLeft: iRect ? Math.round(iRect.left) : null,
          invBottom: iRect ? Math.round(winH - iRect.bottom) : null,
          invVisible: iRect && iRect.width > 0 && iRect.height > 0,
          fsRight: fRect ? Math.round(winW - fRect.right) : null,
          fsBottom: fRect ? Math.round(winH - fRect.bottom) : null,
          fsVisible: !!fRect,
          brandLeft: bRect ? Math.round(bRect.left) : null,
          brandTop: bRect ? Math.round(bRect.top) : null,
          brandVisible: bRect && bRect.width > 0 && bRect.height > 0,
          chatRight: cRect ? Math.round(winW - cRect.right) : null,
          chatTop: cRect ? Math.round(cRect.top) : null,
          chatVisible: cRect && cRect.width > 0 && cRect.height > 0
        };
      })()`);

      // 1. Bottom-Left: Invite Button Sweet Spot
      assert(corners.invVisible, `${vp.name}: Invite button is rendered and visible`);
      assert(
        corners.invLeft >= 8 && corners.invLeft <= 45,
        `${vp.name}: Invite button positioned in bottom-left corner sweet spot`,
        `left=${corners.invLeft}px (expected 8px-45px, not pushed hundreds of pixels inward)`
      );

      // 2. Bottom-Right: Fullscreen Button Sweet Spot
      assert(corners.fsVisible, `${vp.name}: Fullscreen toggle is rendered and visible`);
      assert(
        corners.fsRight >= 8 && corners.fsRight <= 45,
        `${vp.name}: Fullscreen toggle positioned in bottom-right corner sweet spot`,
        `right=${corners.fsRight}px (expected 8px-45px)`
      );

      // 3. Top-Left: Brand / Room Info Sweet Spot
      assert(corners.brandVisible, `${vp.name}: Top brand heading is rendered and visible`);
      assert(
        corners.brandLeft >= 12 && corners.brandLeft <= 45,
        `${vp.name}: Top brand heading positioned in top-left corner sweet spot`,
        `left=${corners.brandLeft}px (expected 12px-45px)`
      );

      // 4. Top-Right: Chat Toggle Button Sweet Spot
      assert(corners.chatVisible, `${vp.name}: Top chat button is rendered and visible`);
      assert(
        corners.chatRight >= 12 && corners.chatRight <= 45,
        `${vp.name}: Top chat button positioned in top-right corner sweet spot`,
        `right=${corners.chatRight}px (expected 12px-45px)`
      );
    }

    console.log('\n------------------------------------------------------------------------');
    console.log('  SUITE 3: CINEMA STAGE LOUNGE BOX SCALE & PROPORTIONATE EXPANSION      ');
    console.log('------------------------------------------------------------------------\n');

    // Desktop Scale (Desktop 1920x1080)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1.0, mobile: false });
    await sleep(80);
    const desktopLounge = await cdp.eval(`(() => {
      const card = document.querySelector('.stage-lounge-card');
      const avatarBox = document.querySelector('.stage-center-avatar-box');
      const title = document.querySelector('.stage-lounge-title');
      const btn = document.getElementById('openMovieLibraryBtn') || document.querySelector('.btn-stage-primary');
      const tile = document.getElementById('testParticipantTile');
      const tileAvatar = tile ? tile.querySelector('.tile-avatar-center') : null;
      if (!card) return null;
      const cRect = card.getBoundingClientRect();
      const aRect = avatarBox ? avatarBox.getBoundingClientRect() : null;
      const tStyle = title ? getComputedStyle(title) : null;
      const bRect = btn ? btn.getBoundingClientRect() : null;
      const taRect = tileAvatar ? tileAvatar.getBoundingClientRect() : null;

      return {
        cardWidth: Math.round(cRect.width),
        cardHeight: Math.round(cRect.height),
        avatarDiameter: aRect ? Math.round(aRect.width) : 0,
        titleFontSize: tStyle ? parseFloat(tStyle.fontSize) : 0,
        btnWidth: bRect ? Math.round(bRect.width) : 0,
        btnHeight: bRect ? Math.round(bRect.height) : 0,
        tileAvatarDiameter: taRect ? Math.round(taRect.width) : 0
      };
    })()`);

    assert(desktopLounge.cardWidth >= 540, 'Desktop: .stage-lounge-card width expanded to grand proportions', `width=${desktopLounge.cardWidth}px >= 540px`);
    assert(desktopLounge.avatarDiameter >= 80, 'Desktop: Cinema stage host avatar scaled up', `avatar=${desktopLounge.avatarDiameter}px >= 80px`);
    assert(desktopLounge.titleFontSize >= 22, 'Desktop: Lounge title typography scaled up', `fontSize=${desktopLounge.titleFontSize}px >= 22px`);
    assert(desktopLounge.btnWidth >= 200 && desktopLounge.btnHeight >= 42, 'Desktop: "Select Movie to Stream" CTA button has commanding presence', `${desktopLounge.btnWidth}x${desktopLounge.btnHeight}px`);
    assert(desktopLounge.tileAvatarDiameter >= 80, 'Desktop: Participant webcam avatar scaled proportionately to eliminate empty card void', `tileAvatar=${desktopLounge.tileAvatarDiameter}px >= 80px`);

    // Tablet Scale (iPad Pro 1024x1366)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2.0, mobile: true });
    await sleep(80);
    const tabletLounge = await cdp.eval(`(() => {
      const card = document.querySelector('.stage-lounge-card');
      const avatarBox = document.querySelector('.stage-center-avatar-box');
      const title = document.querySelector('.stage-lounge-title');
      const tile = document.getElementById('testParticipantTile');
      const tileAvatar = tile ? tile.querySelector('.tile-avatar-center') : null;
      if (!card) return null;
      const cRect = card.getBoundingClientRect();
      const aRect = avatarBox ? avatarBox.getBoundingClientRect() : null;
      const tStyle = title ? getComputedStyle(title) : null;
      const taRect = tileAvatar ? tileAvatar.getBoundingClientRect() : null;
      return {
        cardWidth: Math.round(cRect.width),
        avatarDiameter: aRect ? Math.round(aRect.width) : 0,
        titleFontSize: tStyle ? parseFloat(tStyle.fontSize) : 0,
        tileAvatarDiameter: taRect ? Math.round(taRect.width) : 0
      };
    })()`);

    assert(tabletLounge.cardWidth >= 480, 'Tablet: .stage-lounge-card width scaled proportionately', `width=${tabletLounge.cardWidth}px >= 480px`);
    assert(tabletLounge.avatarDiameter >= 72, 'Tablet: Host avatar scaled for touch display', `avatar=${tabletLounge.avatarDiameter}px >= 72px`);
    assert(tabletLounge.titleFontSize >= 20, 'Tablet: Lounge title typography legible and bold', `fontSize=${tabletLounge.titleFontSize}px >= 20px`);
    assert(tabletLounge.tileAvatarDiameter >= 78, 'Tablet: Participant webcam avatar scaled cleanly in webcam box', `tileAvatar=${tabletLounge.tileAvatarDiameter}px >= 78px`);

    // Mobile Portrait Scale (iPhone 15 Pro 393x852)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 3.0, mobile: true });
    await sleep(80);
    const mobileLounge = await cdp.eval(`(() => {
      const card = document.querySelector('.stage-lounge-card');
      const avatarBox = document.querySelector('.stage-center-avatar-box');
      const title = document.querySelector('.stage-lounge-title');
      const btn = document.getElementById('openMovieLibraryBtn') || document.querySelector('.btn-stage-primary');
      const tile = document.getElementById('testParticipantTile');
      const tileAvatar = tile ? tile.querySelector('.tile-avatar-center') : null;
      if (!card) return null;
      const cRect = card.getBoundingClientRect();
      const aRect = avatarBox ? avatarBox.getBoundingClientRect() : null;
      const tStyle = title ? getComputedStyle(title) : null;
      const bRect = btn ? btn.getBoundingClientRect() : null;
      const taRect = tileAvatar ? tileAvatar.getBoundingClientRect() : null;
      return {
        cardWidth: Math.round(cRect.width),
        avatarDiameter: aRect ? Math.round(aRect.width) : 0,
        titleFontSize: tStyle ? parseFloat(tStyle.fontSize) : 0,
        btnHeight: bRect ? Math.round(bRect.height) : 0,
        tileAvatarDiameter: taRect ? Math.round(taRect.width) : 0
      };
    })()`);

    assert(mobileLounge.cardWidth >= 300, 'Mobile: .stage-lounge-card fills viewport width naturally', `width=${mobileLounge.cardWidth}px (76%+ viewport)`);
    assert(mobileLounge.avatarDiameter >= 56, 'Mobile: Host avatar scaled cleanly', `avatar=${mobileLounge.avatarDiameter}px >= 56px`);
    assert(mobileLounge.btnHeight >= 42, 'Mobile: Stream Movie CTA button meets minimum touch target', `height=${mobileLounge.btnHeight}px >= 42px`);
    assert(mobileLounge.tileAvatarDiameter >= 72, 'Mobile: Participant webcam avatar fills tile box with balanced proportions', `tileAvatar=${mobileLounge.tileAvatarDiameter}px >= 72px`);

    console.log('\n------------------------------------------------------------------------');
    console.log('  SUITE 4: LATERAL VOIDS ELIMINATION & ATMOSPHERIC AMBIENT BACKDROP     ');
    console.log('------------------------------------------------------------------------\n');

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1.0, mobile: false });
    await sleep(80);
    const stageAtmosphere = await cdp.eval(`(() => {
      const stageSec = document.querySelector('.stage-section');
      const cinemaWrapper = document.querySelector('.cinema-stage-wrapper');
      const cinemaGroup = document.querySelector('.stage-cinema-group');
      const halo = document.querySelector('.stage-lounge-halo');

      const secStyle = stageSec ? getComputedStyle(stageSec) : null;
      const haloRect = halo ? halo.getBoundingClientRect() : null;
      const wrapRect = cinemaWrapper ? cinemaWrapper.getBoundingClientRect() : null;

      return {
        hasStageGradient: secStyle ? secStyle.backgroundImage.includes('gradient') : false,
        haloWidth: haloRect ? Math.round(haloRect.width) : 0,
        wrapperWidth: wrapRect ? Math.round(wrapRect.width) : 0
      };
    })()`);

    assert(stageAtmosphere.hasStageGradient, 'Atmospheric ambient radial lighting active on .stage-section');
    assert(stageAtmosphere.haloWidth >= 900, 'Ambient breathing stage halo expanded to dissolve lateral dark voids', `haloWidth=${stageAtmosphere.haloWidth}px >= 900px`);
    assert(stageAtmosphere.wrapperWidth >= 1160, 'Cinema stage frame scales generously on widescreen monitors', `wrapperWidth=${stageAtmosphere.wrapperWidth}px >= 1160px`);

    console.log('\n------------------------------------------------------------------------');
    console.log('  SUITE 5: STRICT ZERO-EMOJI POLICY COMPLIANCE SCAN                     ');
    console.log('------------------------------------------------------------------------\n');

    // Emoji regex checking astral plane unicode emoji code points
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/u;

    const filesToAudit = [
      path.join(PUBLIC_DIR, 'style.css'),
      path.join(PUBLIC_DIR, 'index.html'),
      path.join(PUBLIC_DIR, 'app.js'),
      path.join(__dirname, '..', 'server.js'),
      __filename
    ];

    for (const f of filesToAudit) {
      const content = fs.readFileSync(f, 'utf8');
      const hasEmoji = emojiRegex.test(content);
      const relName = path.relative(path.resolve(__dirname, '..'), f);
      assert(!hasEmoji, `${relName}: Contains exactly 0 raw emojis`);
    }

    console.log('\n========================================================================');
    console.log(`  FINAL RESULTS: ${passedCount} passed, ${failedCount} failed`);
    console.log('========================================================================\n');

    if (failureLog.length > 0) {
      console.log('[FAILURES DETECTED]:');
      failureLog.forEach(f => console.log('  ' + f));
    } else {
      console.log('[SUCCESS] All screen layout, proportions, and positioning tests PASSED flawlessly!');
    }

  } catch (err) {
    console.error('[ERROR] Test run encountered error:', err);
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

runPositioningAudit();
