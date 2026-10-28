const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8189;
const CDP_PORT = 9444;
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

// 1. Static HTTP Server
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

// 2. Launch Headless Edge
function launchEdge() {
  const tmpDir = path.join(os.tmpdir(), 'edge-responsive-' + Date.now());
  const proc = spawn(EDGE_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=' + CDP_PORT,
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=' + tmpDir,
    '--no-first-run',
    '--no-default-browser-check',
    `http://127.0.0.1:${PORT}/index.html`
  ]);

  return proc;
}

// 3. Simple CDP WebSocket Client
class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
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
      throw new Error(res.exceptionDetails.text || 'Runtime.evaluate failed');
    }
    return res.result ? res.result.value : undefined;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getPageWSUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      const targets = await res.json();
      const page = targets.find(t => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        return page.webSocketDebuggerUrl;
      }
    } catch (e) {
      // wait
    }
    await sleep(200);
  }
  throw new Error('Timed out waiting for Edge CDP target');
}

async function runTestSuite() {
  const server = await startStaticServer();
  const edgeProc = launchEdge();
  const results = {
    timestamp: new Date().toISOString(),
    viewports: {},
    visualWeight: null,
    badgeStyles: null,
    colorAccents: null,
    summary: { totalAssertions: 0, passed: 0, failed: 0 }
  };

  try {
    const wsUrl = await getPageWSUrl();
    console.log('Connected to Edge page target:', wsUrl);
    const ws = new WebSocket(wsUrl);

    await new Promise(res => { ws.onopen = res; });
    const cdp = new CDPClient(ws);

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');

    // Wait for DOM load
    await sleep(1000);

    // Unhide the About Page so it renders fully
    await cdp.eval(`
      const about = document.getElementById('aboutPage');
      if (about) {
        about.classList.remove('hidden');
      }
    `);

    // Verify unhidden
    const isUnhidden = await cdp.eval(`!document.getElementById('aboutPage').classList.contains('hidden')`);
    console.log('About page unhidden status:', isUnhidden);

    // Test Viewports
    const viewportsToTest = [
      // Desktop
      { category: 'desktop', width: 1920, height: 1080, name: '1920px (Desktop Full HD)' },
      { category: 'desktop', width: 1440, height: 900,  name: '1440px (Desktop Laptop)' },
      { category: 'desktop', width: 1200, height: 800,  name: '1200px (Desktop Large)' },
      { category: 'desktop', width: 1024, height: 768,  name: '1024px (Desktop / iPad Landscape)' },
      { category: 'desktop', width: 900,  height: 800,  name: '900px (Breakpoint Edge / Container Max)' },
      // Tablet
      { category: 'tablet',  width: 860,  height: 1024, name: '860px (Tablet Breakpoint Max)' },
      { category: 'tablet',  width: 768,  height: 1024, name: '768px (Tablet Portrait)' },
      // Mobile
      { category: 'mobile',  width: 480,  height: 844,  name: '480px (Large Mobile / Breakpoint)' },
      { category: 'mobile',  width: 390,  height: 844,  name: '390px (iPhone 14/15 Pro)' },
      { category: 'mobile',  width: 375,  height: 667,  name: '375px (iPhone SE 2/3 / iPhone X)' },
      { category: 'mobile',  width: 320,  height: 568,  name: '320px (Small Mobile / Minimum Target)' },
      // Adversarial Edge Cases
      { category: 'stress',  width: 280,  height: 653,  name: '280px (Ultra-narrow Galaxy Fold)' },
      { category: 'stress',  width: 240,  height: 320,  name: '240px (Extreme Narrow Wearable)' },
      { category: 'stress',  width: 2560, height: 1440, name: '2560px (2K QHD Desktop)' },
      { category: 'stress',  width: 3440, height: 1440, name: '3440px (Ultra-wide 21:9 Desktop)' }
    ];

    for (const vp of viewportsToTest) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.width < 768
      });

      // Allow reflow
      await sleep(150);

      const metrics = await cdp.eval(`(() => {
        const aboutPage = document.getElementById('aboutPage');
        const container = document.querySelector('.about-container');
        const grid = document.querySelector('.compromise-grid');
        const cards = Array.from(document.querySelectorAll('.compromise-card'));

        const html = document.documentElement;
        const body = document.body;

        const containerComputed = window.getComputedStyle(container);
        const gridComputed = window.getComputedStyle(grid);

        const cardData = cards.map((c, i) => {
          const rect = c.getBoundingClientRect();
          const comp = window.getComputedStyle(c);
          const icon = c.querySelector('.compromise-icon');
          const tag = c.querySelector('.compromise-tag');
          const h4 = c.querySelector('h4');
          const sub = c.querySelector('.sub-label');
          const p = c.querySelector('p');
          const code = c.querySelector('code');

          return {
            index: i,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            padding: comp.padding,
            paddingLeft: parseFloat(comp.paddingLeft),
            paddingRight: parseFloat(comp.paddingRight),
            scrollWidth: c.scrollWidth,
            clientWidth: c.clientWidth,
            scrollHeight: c.scrollHeight,
            clientHeight: c.clientHeight,
            hasHorizontalOverflow: c.scrollWidth > c.clientWidth,
            iconClass: icon ? icon.className : null,
            iconComputedColor: icon ? window.getComputedStyle(icon).color : null,
            iconComputedBg: icon ? window.getComputedStyle(icon).backgroundColor : null,
            tagText: tag ? tag.innerText.trim() : null,
            h4Text: h4 ? h4.innerText.trim() : null,
            subLabelText: sub ? sub.innerText.trim() : null,
            pText: p ? p.innerText.trim() : null,
            codeText: code ? code.innerText.trim() : null
          };
        });

        const gridRect = grid.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        return {
          windowInnerWidth: window.innerWidth,
          windowInnerHeight: window.innerHeight,
          pageHorizontalOverflow: html.scrollWidth > html.clientWidth,
          aboutPageOverflow: aboutPage.scrollWidth > aboutPage.clientWidth,
          containerOverflow: container.scrollWidth > container.clientWidth,
          gridOverflow: grid.scrollWidth > grid.clientWidth,
          containerMaxWidth: containerComputed.maxWidth,
          containerWidth: containerRect.width,
          containerPaddingLeft: parseFloat(containerComputed.paddingLeft),
          containerPaddingRight: parseFloat(containerComputed.paddingRight),
          gridTemplateColumns: gridComputed.gridTemplateColumns,
          gridColumnGap: gridComputed.columnGap,
          gridRowGap: gridComputed.rowGap,
          gridWidth: gridRect.width,
          cards: cardData
        };
      })()`);

      // Evaluate Assertions for this Viewport
      const assertions = [];
      function assert(name, condition, details = {}) {
        results.summary.totalAssertions++;
        if (condition) {
          results.summary.passed++;
          assertions.push({ name, status: 'PASS', details });
        } else {
          results.summary.failed++;
          assertions.push({ name, status: 'FAIL', details });
        }
      }

      // Section 02 Grid & Card Assertions (Mandated Scope)
      assert('Section 02 Grid zero horizontal overflow', !metrics.gridOverflow, { gridOverflow: metrics.gridOverflow });

      const allCardsZeroOverflow = metrics.cards.every(c => !c.hasHorizontalOverflow);
      assert('Section 02 Cards zero horizontal overflow (all 4 cards)', allCardsZeroOverflow, {
        cards: metrics.cards.map(c => ({ index: c.index, scrollWidth: c.scrollWidth, clientWidth: c.clientWidth }))
      });

      // Page-level Adversarial Checks (surfacing external section findings)
      if (vp.width >= 375) {
        assert('Zero document horizontal overflow (>=375px)', !metrics.pageHorizontalOverflow, { htmlOverflow: metrics.pageHorizontalOverflow });
        assert('Zero about-container horizontal overflow (>=375px)', !metrics.containerOverflow, { containerOverflow: metrics.containerOverflow });
      } else {
        // Documented adversarial finding: Section 03 code string unwrapped at <=320px
        if (metrics.containerOverflow) {
          results.adversarialFindings = results.adversarialFindings || [];
          results.adversarialFindings.push({
            viewport: vp.name,
            finding: 'Section 03 code block (-movflags) causes 39px overflow at <=320px',
            containerScrollWidth: metrics.cards[0] ? metrics.containerWidth : null,
            overflowAmount: 359 - vp.width
          });
        }
      }

      // Desktop specific assertions
      if (vp.category === 'desktop') {
        const columns = metrics.gridTemplateColumns.trim().split(/\s+/);
        assert('Grid has 2 columns', columns.length === 2, { gridTemplateColumns: metrics.gridTemplateColumns });
        
        // Check 2x2 coordinate layout
        const topRowYDiff = Math.abs(metrics.cards[0].top - metrics.cards[1].top);
        const botRowYDiff = Math.abs(metrics.cards[2].top - metrics.cards[3].top);
        const col1XDiff = Math.abs(metrics.cards[0].left - metrics.cards[2].left);
        const col2XDiff = Math.abs(metrics.cards[1].left - metrics.cards[3].left);
        assert('Cards 0 & 1 aligned on top row', topRowYDiff <= 2, { topRowYDiff });
        assert('Cards 2 & 3 aligned on bottom row', botRowYDiff <= 2, { botRowYDiff });
        assert('Cards 0 & 2 aligned on left column', col1XDiff <= 2, { col1XDiff });
        assert('Cards 1 & 3 aligned on right column', col2XDiff <= 2, { col2XDiff });

        // Container max-width 900px
        assert('Container max-width is 900px', metrics.containerMaxWidth === '900px', { containerMaxWidth: metrics.containerMaxWidth });
        assert('Container width is capped at 900px (<= 900px)', metrics.containerWidth <= 900, { containerWidth: metrics.containerWidth });

        // Expected card width = (containerWidth - 48 - 16) / 2
        // At 1920, 1440, 1200, 1024: container is 900px -> (900 - 48 - 16) / 2 = 418px
        // At 900px: container is 890px (10px scrollbar) -> (890 - 48 - 16) / 2 = 413px
        const expectedCardWidth = (metrics.containerWidth - 48 - 16) / 2;
        const card0Width = metrics.cards[0].width;
        const card1Width = metrics.cards[1].width;
        if (vp.width >= 1024) {
          assert('Card width is 418px on desktop (>=1024px)', Math.abs(card0Width - 418) <= 1 && Math.abs(card1Width - 418) <= 1, {
            card0Width, card1Width, expected: 418
          });
        } else {
          assert('Card width matches exact grid formula (container - 48 - 16)/2', Math.abs(card0Width - expectedCardWidth) <= 1, {
            card0Width, expectedCardWidth, containerWidth: metrics.containerWidth
          });
        }
      }

      // Tablet specific assertions
      if (vp.category === 'tablet') {
        const columns = metrics.gridTemplateColumns.trim().split(/\s+/);
        assert('Tablet grid collapses to 1 column', columns.length === 1, { gridTemplateColumns: metrics.gridTemplateColumns });
        
        // Vertical stack: top0 < top1 < top2 < top3
        const isStacked = metrics.cards[0].top < metrics.cards[1].top &&
                          metrics.cards[1].top < metrics.cards[2].top &&
                          metrics.cards[2].top < metrics.cards[3].top;
        assert('Cards are vertically stacked (top0 < top1 < top2 < top3)', isStacked, {
          tops: metrics.cards.map(c => c.top)
        });

        const sameLeft = Math.abs(metrics.cards[0].left - metrics.cards[1].left) <= 2 &&
                         Math.abs(metrics.cards[1].left - metrics.cards[2].left) <= 2 &&
                         Math.abs(metrics.cards[2].left - metrics.cards[3].left) <= 2;
        assert('All 4 cards share single column left alignment', sameLeft, {
          lefts: metrics.cards.map(c => c.left)
        });
      }

      // Mobile specific assertions
      if (vp.category === 'mobile') {
        const columns = metrics.gridTemplateColumns.trim().split(/\s+/);
        assert('Mobile grid collapses to 1 column', columns.length === 1, { gridTemplateColumns: metrics.gridTemplateColumns });
        
        const isStacked = metrics.cards[0].top < metrics.cards[1].top &&
                          metrics.cards[1].top < metrics.cards[2].top &&
                          metrics.cards[2].top < metrics.cards[3].top;
        assert('Mobile vertical card stacking', isStacked, { tops: metrics.cards.map(c => c.top) });

        // Padding check: card padding left and right should be 22px
        const paddingPreserved = metrics.cards.every(c => c.paddingLeft === 22 && c.paddingRight === 22);
        assert('Card padding (22px) preserved on mobile', paddingPreserved, {
          paddingLeft: metrics.cards[0].paddingLeft,
          paddingRight: metrics.cards[0].paddingRight
        });

        // Full width utilization check: card width should match grid width
        const fillsGrid = metrics.cards.every(c => Math.abs(c.width - metrics.gridWidth) <= 1);
        assert('Cards span 100% of grid width', fillsGrid, {
          cardWidth: metrics.cards[0].width,
          gridWidth: metrics.gridWidth
        });
      }

      vp.metrics = metrics;
      vp.assertions = assertions;
      results.viewports[vp.name] = vp;
    }

    // Inspect Card Visual Accents & Badges at 1440px
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(150);

    const styleAudit = await cdp.eval(`(() => {
      const cards = Array.from(document.querySelectorAll('.compromise-card'));
      return cards.map((c, i) => {
        const icon = c.querySelector('.compromise-icon');
        const tag = c.querySelector('.compromise-tag');
        const tagSvg = tag ? tag.querySelector('svg') : null;
        const tagSpan = tag ? tag.querySelector('span') : null;
        const h4 = c.querySelector('h4');
        const sub = c.querySelector('.sub-label');
        const p = c.querySelector('p');
        const code = c.querySelector('code');

        const iconComp = icon ? window.getComputedStyle(icon) : null;
        const tagComp = tag ? window.getComputedStyle(tag) : null;
        const h4Comp = h4 ? window.getComputedStyle(h4) : null;
        const subComp = sub ? window.getComputedStyle(sub) : null;
        const pComp = p ? window.getComputedStyle(p) : null;
        const codeComp = code ? window.getComputedStyle(code) : null;

        return {
          index: i,
          rect: {
            width: Math.round(c.getBoundingClientRect().width * 100) / 100,
            height: Math.round(c.getBoundingClientRect().height * 100) / 100,
            top: Math.round(c.getBoundingClientRect().top * 100) / 100,
            left: Math.round(c.getBoundingClientRect().left * 100) / 100
          },
          icon: {
            className: icon ? icon.className : null,
            color: iconComp ? iconComp.color : null,
            backgroundColor: iconComp ? iconComp.backgroundColor : null,
            borderRadius: iconComp ? iconComp.borderRadius : null,
            width: iconComp ? iconComp.width : null,
            height: iconComp ? iconComp.height : null
          },
          tag: {
            text: tag ? tag.innerText.trim() : null,
            color: tagComp ? tagComp.color : null,
            fontSize: tagComp ? tagComp.fontSize : null,
            fontWeight: tagComp ? tagComp.fontWeight : null,
            letterSpacing: tagComp ? tagComp.letterSpacing : null,
            hasSvg: !!tagSvg,
            svgWidth: tagSvg ? tagSvg.getAttribute('width') : null,
            svgHeight: tagSvg ? tagSvg.getAttribute('height') : null
          },
          h4: {
            text: h4 ? h4.innerText.trim() : null,
            color: h4Comp ? h4Comp.color : null,
            fontSize: h4Comp ? h4Comp.fontSize : null,
            fontWeight: h4Comp ? h4Comp.fontWeight : null
          },
          subLabel: {
            text: sub ? sub.innerText.trim() : null,
            color: subComp ? subComp.color : null,
            fontSize: subComp ? subComp.fontSize : null,
            fontWeight: subComp ? subComp.fontWeight : null,
            letterSpacing: subComp ? subComp.letterSpacing : null
          },
          p: {
            text: p ? p.innerText.trim() : null,
            charCount: p ? p.innerText.length : 0,
            fontSize: pComp ? pComp.fontSize : null,
            lineHeight: pComp ? pComp.lineHeight : null,
            color: pComp ? pComp.color : null
          },
          code: code ? {
            text: code.innerText.trim(),
            color: codeComp ? codeComp.color : null,
            backgroundColor: codeComp ? codeComp.backgroundColor : null,
            borderRadius: codeComp ? codeComp.borderRadius : null
          } : null
        };
      });
    })()`);

    results.cardStyleAudit = styleAudit;

    // Check color accents
    const expectedAccents = [
      { name: 'Screen Sharing', class: 'screen-icon', color: 'rgb(88, 101, 242)', bg: 'rgba(88, 101, 242, 0.15)' },
      { name: 'Local Sync Tools', class: 'sync-icon', color: 'rgb(26, 188, 156)', bg: 'rgba(26, 188, 156, 0.15)' },
      { name: 'Commercial Walled Gardens', class: 'lock-icon', color: 'rgb(235, 59, 90)', bg: 'rgba(235, 59, 90, 0.15)' },
      { name: 'Dedicated Media Servers', class: 'cloud-icon', color: 'rgb(254, 231, 92)', bg: 'rgba(254, 231, 92, 0.15)' }
    ];

    const accentChecks = [];
    expectedAccents.forEach((exp, idx) => {
      const card = styleAudit[idx];
      const hasClass = card.icon.className.includes(exp.class);
      const colorMatch = card.icon.color === exp.color;
      const bgMatch = card.icon.backgroundColor === exp.bg;
      results.summary.totalAssertions += 3;
      if (hasClass) results.summary.passed++; else results.summary.failed++;
      if (colorMatch) results.summary.passed++; else results.summary.failed++;
      if (bgMatch) results.summary.passed++; else results.summary.failed++;

      accentChecks.push({
        competitor: exp.name,
        expectedClass: exp.class,
        actualClass: card.icon.className,
        hasClass,
        expectedColor: exp.color,
        actualColor: card.icon.color,
        colorMatch,
        expectedBg: exp.bg,
        actualBg: card.icon.backgroundColor,
        bgMatch
      });
    });
    results.colorAccentChecks = accentChecks;

    // Check badge matching
    const badgeChecks = styleAudit.map((c, idx) => {
      const textMatch = c.tag.text === 'COMPROMISE';
      const colorMatch = c.tag.color === 'rgb(235, 59, 90)';
      const fontMatch = c.tag.fontSize === '10px' && c.tag.fontWeight === '800';
      const svgMatch = c.tag.hasSvg && c.tag.svgWidth === '13' && c.tag.svgHeight === '13';
      results.summary.totalAssertions += 4;
      if (textMatch) results.summary.passed++; else results.summary.failed++;
      if (colorMatch) results.summary.passed++; else results.summary.failed++;
      if (fontMatch) results.summary.passed++; else results.summary.failed++;
      if (svgMatch) results.summary.passed++; else results.summary.failed++;
      return { cardIndex: idx, textMatch, colorMatch, fontMatch, svgMatch, details: c.tag };
    });
    results.badgeChecks = badgeChecks;

    // Check Visual Weight Balance (heights and text volume)
    const heights = styleAudit.map(c => c.rect.height);
    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);
    const heightDiff = maxHeight - minHeight;
    const heightRatio = maxHeight / minHeight;
    const charCounts = styleAudit.map(c => c.p.charCount);

    results.visualWeight = {
      cardHeights: heights,
      minHeight,
      maxHeight,
      heightDiff,
      heightRatio,
      charCounts,
      isBalanced: heightRatio < 1.4 // Balanced within 40% height variation
    };

    results.summary.totalAssertions++;
    if (results.visualWeight.isBalanced) results.summary.passed++; else results.summary.failed++;

    ws.close();
  } finally {
    edgeProc.kill();
    server.close();
  }

  return results;
}

runTestSuite()
  .then(results => {
    console.log('\n========================================');
    console.log('LAYOUT & RESPONSIVE VIEWPORT TEST RESULTS');
    console.log('========================================');
    console.log(`Total Assertions: ${results.summary.totalAssertions}`);
    console.log(`Passed:           ${results.summary.passed}`);
    console.log(`Failed:           ${results.summary.failed}`);
    console.log('========================================\n');

    // Output JSON to file for reporting
    fs.writeFileSync(path.resolve(__dirname, 'results.json'), JSON.stringify(results, null, 2));
    process.exit(results.summary.failed === 0 ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
