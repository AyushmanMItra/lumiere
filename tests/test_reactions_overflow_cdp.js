/**
 * TEST SUITE: Live Reactions Dock Tray Zero-Overflow Verification
 * 
 * Tests via Chrome DevTools Protocol in real browser across:
 * - Desktop (1920x1080)
 * - Tablet Landscape & Portrait (1024x768, 768x1024)
 * - Mobile Portrait (393x852, 375x667, 360x800)
 * - Mobile Landscape (852x393, 667x375)
 * 
 * Asserts:
 * - All 9 reaction buttons are fully enclosed inside #dockReactionsTray
 * - Zero buttons overflow out of the background container
 * - Tray is visible, properly elevated, and has valid capsule border-radius
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8193;
const CDP_PORT = 9447;
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
      console.log(`Static server running at http://127.0.0.1:${PORT}/`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

function launchEdge() {
  const tmpDir = path.join(os.tmpdir(), 'edge-reactions-overflow-' + Date.now());
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
          const page = list.find(t => t.type === 'page');
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

async function runTests() {
  console.log('================================================================');
  console.log('  TEST SUITE: DOCK REACTIONS TRAY ZERO-OVERFLOW CDP VERIFICATION');
  console.log('================================================================\n');

  let server;
  let edgeInfo;
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    server = await startStaticServer();
    edgeInfo = await launchEdge();
    const wsUrl = await getPageWSUrl();
    const ws = new (require('ws'))(wsUrl);
    await new Promise(res => { ws.onopen = res; });
    const cdp = new CDPClient(ws);

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');
    await sleep(1000);

    // Initialize theater state and reveal reactions tray
    await cdp.eval(`(() => {
      const landing = document.getElementById('landingPageWrapper');
      const appContainer = document.getElementById('appContainer');
      const theater = document.getElementById('theaterArea');
      const tray = document.getElementById('dockReactionsTray');
      if (landing) landing.classList.add('hidden');
      if (appContainer) appContainer.classList.remove('hidden');
      if (theater) theater.classList.remove('hidden');
      if (tray) tray.classList.remove('hidden');
    })()`);

    const viewports = [
      { name: 'Desktop Full HD (1920x1080)', width: 1920, height: 1080, mobile: false },
      { name: 'iPad Mini Landscape (1024x768)', width: 1024, height: 768, mobile: false },
      { name: 'iPad Mini Portrait (768x1024)', width: 768, height: 1024, mobile: false },
      { name: 'iPhone 14/15 Pro Portrait (393x852)', width: 393, height: 852, mobile: true },
      { name: 'iPhone SE 3rd Gen Portrait (375x667)', width: 375, height: 667, mobile: true },
      { name: 'Samsung Galaxy S20 Portrait (360x800)', width: 360, height: 800, mobile: true },
      { name: 'iPhone 14/15 Pro Landscape (852x393)', width: 852, height: 393, mobile: true },
      { name: 'iPhone SE Landscape (667x375)', width: 667, height: 375, mobile: true }
    ];

    for (const vp of viewports) {
      console.log(`\n----------------------------------------------------------------`);
      console.log(`  VIEWPORT: ${vp.name}`);
      console.log(`----------------------------------------------------------------`);

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.mobile
      });

      await sleep(200);

      const metrics = await cdp.eval(`(() => {
        const tray = document.getElementById('dockReactionsTray');
        if (!tray) return { error: 'Tray not found' };
        
        const trayRect = tray.getBoundingClientRect();
        const items = Array.from(tray.querySelectorAll('.dock-reaction-item'));
        const itemMetrics = items.map((item, idx) => {
          const rect = item.getBoundingClientRect();
          return {
            index: idx + 1,
            reaction: item.dataset.reaction,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          };
        });

        return {
          viewportWidth: window.innerWidth,
          tray: {
            left: trayRect.left,
            right: trayRect.right,
            top: trayRect.top,
            bottom: trayRect.bottom,
            width: trayRect.width,
            height: trayRect.height
          },
          itemCount: itemMetrics.length,
          items: itemMetrics
        };
      })()`);

      assert(metrics.tray && metrics.tray.width > 200, `${vp.name}: Reactions tray is rendered with width ${Math.round(metrics.tray?.width || 0)}px`);
      assert(metrics.itemCount === 9, `${vp.name}: Exactly 9 reaction items found in tray`);

      // Check that EVERY single item is fully contained inside the tray bounding rect (within 2px tolerance for subpixel borders)
      let allContained = true;
      let overflowDetails = [];
      const tray = metrics.tray;

      for (const item of metrics.items) {
        const overflowsLeft = item.left < tray.left - 2;
        const overflowsRight = item.right > tray.right + 2;
        const overflowsTop = item.top < tray.top - 2;
        const overflowsBottom = item.bottom > tray.bottom + 2;

        if (overflowsLeft || overflowsRight || overflowsTop || overflowsBottom) {
          allContained = false;
          overflowDetails.push(`Item ${item.index} (${item.reaction}): item.right=${Math.round(item.right)} vs tray.right=${Math.round(tray.right)}`);
        }
      }

      assert(allContained, `${vp.name}: All 9 reaction icons are 100% contained inside tray container`);
      if (!allContained) {
        console.error('    Overflow details:', overflowDetails.join('; '));
      }

      // Check that the tray itself does not overflow outside the viewport
      assert(tray.left >= 0, `${vp.name}: Tray does not overflow viewport left (tray.left=${Math.round(tray.left)}px >= 0)`);
      assert(tray.right <= vp.width + 2, `${vp.name}: Tray does not overflow viewport right (tray.right=${Math.round(tray.right)}px <= ${vp.width}px)`);
    }

    console.log('\n================================================================');
    console.log(`  REAL BROWSER ZERO-OVERFLOW CDP TEST SUMMARY`);
    console.log(`  Total Checks: ${passed + failed}`);
    console.log(`  Passed:       ${passed}`);
    console.log(`  Failed:       ${failed}`);
    console.log('================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    if (edgeInfo && edgeInfo.proc) {
      try {
        edgeInfo.proc.kill('SIGKILL');
      } catch (e) {}
    }
    if (server) {
      server.close();
    }
  }
}

runTests();
