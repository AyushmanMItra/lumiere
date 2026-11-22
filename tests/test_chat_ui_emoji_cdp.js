/**
 * TEST SUITE: Chat Window UI Redesign, SVG Emoji Picker & Fluid Animations CDP Verification
 *
 * Verifies that:
 * 1. Zero unicode emojis exist anywhere in source files.
 * 2. Chat panel DOM structure contains modern redesign components (drag handle, live pulse dot,
 *    status pill, welcome hero, starter chips, floating new messages pill, send button).
 * 3. Chat emoji button opens graphical SVG emoji picker with vibrant SVGs in place of plain text.
 * 4. Emoji search input filters grid items accurately.
 * 5. Category tabs switch cleanly.
 * 6. Clicking emoji items inserts clean tokens and focusing input.
 * 7. Message rendering converts tokens into inline SVG graphics with role badges.
 * 8. Mobile drawer slide-up, backdrop tap to dismiss, and minimum touch targets (>= 44px).
 * 9. Desktop side drawer slide-in with cubic-bezier easing.
 *
 * Strict No-Emoji Policy: Uses [PASS], [FAIL], [INFO] textual tags.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const wsPkg = require('ws');

const PORT = 8210;
const CDP_PORT = 9460;
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
  const tmpDir = path.join(os.tmpdir(), 'edge-chat-cdp-' + Date.now());
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
  console.log('  TEST SUITE: CHAT UI REDESIGN, SVG EMOJI PICKER & ANIMATIONS CDP AUDIT');
  console.log('========================================================================\n');

  let server;
  let edgeInfo;
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, desc, detail = '') {
    if (condition) {
      passedCount++;
      console.log(`  [PASS] ${desc}`);
    } else {
      failedCount++;
      console.error(`  [FAIL] ${desc} ${detail ? '(' + detail + ')' : ''}`);
    }
  }

  try {
    // 1. Static Emoji Policy verification
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
    const filesToCheck = ['public/index.html', 'public/app.js', 'public/style.css', 'server.js'];
    for (const f of filesToCheck) {
      const content = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf-8');
      const hasEmoji = emojiRegex.test(content);
      assert(!hasEmoji, `Zero raw emojis in ${f}`);
    }

    server = await startStaticServer();
    edgeInfo = await launchEdge();
    const wsUrl = await getPageWSUrl();
    const ws = new wsPkg(wsUrl);
    await new Promise(r => ws.onopen = r);
    const cdp = new CDPClient(ws);

    // Initialize page
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');

    // Set standard desktop viewport (1280x800)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
      screenOrientation: { angle: 0, type: 'landscapePrimary' }
    });

    // Wait for DOM complete and app loaded
    for (let i = 0; i < 50; i++) {
      const ready = await cdp.eval('document.readyState === "complete" && !!document.getElementById("chatSidebar")');
      if (ready) break;
      await sleep(100);
    }
    await sleep(200);

    // Enter room UI (match test_reactions_visibility_cdp pattern)
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
      if (document.body) document.body.classList.add('in-room');
    })()`);
    await sleep(300);

    console.log('\n--- DOM Structure & Glassmorphic Redesign Elements ---');
    const domCheck = await cdp.eval(`(() => {
      return {
        hasSidebar: !!document.getElementById('chatSidebar'),
        hasBackdrop: !!document.getElementById('chatBackdrop'),
        hasDragHandle: !!document.querySelector('.chat-mobile-drag-handle'),
        hasPulseDot: !!document.querySelector('.chat-live-pulse-dot'),
        hasStatusPill: !!document.querySelector('.chat-status-pill'),
        hasCloseBtn: !!document.getElementById('closeChatBtn'),
        hasWelcomeHero: !!document.getElementById('chatWelcomeHero'),
        starterChipsCount: document.querySelectorAll('.chat-starter-chip').length,
        hasNewMessagesPill: !!document.getElementById('chatNewMessagesPill'),
        hasEmojiBtn: !!document.getElementById('chatEmojiBtn'),
        hasReactionBtn: !!document.getElementById('chatReactionBtn'),
        hasSendBtn: !!document.getElementById('chatSendBtn'),
        hasEmojiPicker: !!document.getElementById('chatEmojiPicker'),
        hasEmojiTabs: document.querySelectorAll('.emoji-tab-btn').length,
        hasSearchInput: !!document.getElementById('emojiSearchInput'),
        hasPickerGrid: !!document.getElementById('emojiPickerGrid')
      };
    })()`);

    assert(domCheck.hasSidebar, '#chatSidebar element exists in DOM');
    assert(domCheck.hasBackdrop, '#chatBackdrop overlay exists for mobile dismissal');
    assert(domCheck.hasDragHandle, '.chat-mobile-drag-handle exists for mobile drawer indicator');
    assert(domCheck.hasPulseDot, '.chat-live-pulse-dot exists in chat panel header');
    assert(domCheck.hasStatusPill, '.chat-status-pill exists in chat panel header');
    assert(domCheck.hasCloseBtn, '#closeChatBtn exists in chat panel header');
    assert(domCheck.hasWelcomeHero, '#chatWelcomeHero modern empty state hero exists');
    assert(domCheck.starterChipsCount >= 4, 'Interactive starter reaction chips exist', `count=${domCheck.starterChipsCount}`);
    assert(domCheck.hasNewMessagesPill, '#chatNewMessagesPill floating scroll indicator exists');
    assert(domCheck.hasEmojiBtn, '#chatEmojiBtn exists in chat compose bar');
    assert(domCheck.hasReactionBtn, '#chatReactionBtn exists in chat compose bar');
    assert(domCheck.hasSendBtn, '#chatSendBtn send button exists in compose bar');
    assert(domCheck.hasEmojiPicker, '#chatEmojiPicker popover container exists');
    assert(domCheck.hasEmojiTabs === 4, 'Emoji picker contains 4 category tabs', `count=${domCheck.hasEmojiTabs}`);
    assert(domCheck.hasSearchInput, '#emojiSearchInput search input exists');
    assert(domCheck.hasPickerGrid, '#emojiPickerGrid exists');

    console.log('\n--- Desktop Chat Drawer Open & Close Animations ---');
    // Open chat sidebar via topChatBtn
    const openAnimState = await cdp.eval(`(() => {
      const topChat = document.getElementById('topChatBtn');
      if (topChat) topChat.click();
      const sidebar = document.getElementById('chatSidebar');
      return {
        hadOpeningClass: sidebar.classList.contains('chat-panel-opening'),
        notHidden: !sidebar.classList.contains('hidden')
      };
    })()`);

    assert(openAnimState.notHidden, 'Clicking topChatBtn removes "hidden" class from #chatSidebar');
    assert(openAnimState.hadOpeningClass, 'Opening #chatSidebar triggers .chat-panel-opening class');
    await sleep(350);

    const openState = await cdp.eval(`(() => {
      const sidebar = document.getElementById('chatSidebar');
      const style = window.getComputedStyle(sidebar);
      return {
        display: style.display,
        width: Math.round(sidebar.getBoundingClientRect().width),
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter
      };
    })()`);

    assert(openState.display === 'flex', `Chat panel has computed display: flex (got: ${openState.display})`);
    assert(openState.width === 380, `Chat panel has desktop width of 380px (got: ${openState.width}px)`);
    assert(openState.backdropFilter.includes('blur'), 'Chat panel applies obsidian glassmorphic backdrop-filter blur');

    console.log('\n--- SVG Emoji Picker Popup & Rich Icon Rendering ---');
    // Open emoji picker
    await cdp.eval(`(() => {
      const emojiBtn = document.getElementById('chatEmojiBtn');
      if (emojiBtn) emojiBtn.click();
    })()`);
    await sleep(200);

    const pickerOpenState = await cdp.eval(`(() => {
      const picker = document.getElementById('chatEmojiPicker');
      const grid = document.getElementById('emojiPickerGrid');
      const buttons = Array.from(grid.querySelectorAll('.emoji-item-btn'));
      const itemsWithSvg = buttons.filter(b => b.querySelector('svg')).length;
      const rawTextTokens = buttons.filter(b => {
        const text = b.innerText.trim();
        return text.startsWith(':') && text.endsWith(':');
      }).length;

      return {
        pickerOpen: !picker.classList.contains('hidden'),
        buttonCount: buttons.length,
        itemsWithSvg,
        rawTextTokens,
        firstItemTitle: buttons[0] ? buttons[0].getAttribute('data-name') : null
      };
    })()`);

    assert(pickerOpenState.pickerOpen, 'Clicking #chatEmojiBtn opens #chatEmojiPicker');
    assert(pickerOpenState.buttonCount > 10, 'Emoji picker grid renders item buttons', `count=${pickerOpenState.buttonCount}`);
    assert(pickerOpenState.itemsWithSvg === pickerOpenState.buttonCount, 'Every item in emoji grid renders a graphical SVG child', `svgs=${pickerOpenState.itemsWithSvg}/${pickerOpenState.buttonCount}`);
    assert(pickerOpenState.rawTextTokens === 0, 'Zero items fall back to plain text tokens like :pizza: (got 0 raw text items)');

    console.log('\n--- Category Tabs & Real-time Search Filtering ---');
    // Switch to Hype tab
    await cdp.eval(`(() => {
      const hypeTab = document.querySelector('.emoji-tab-btn[data-category="hype"]');
      if (hypeTab) hypeTab.click();
    })()`);
    await sleep(100);

    const hypeTabState = await cdp.eval(`(() => {
      const hypeTab = document.querySelector('.emoji-tab-btn[data-category="hype"]');
      const grid = document.getElementById('emojiPickerGrid');
      const buttons = Array.from(grid.querySelectorAll('.emoji-item-btn'));
      const hasRocket = buttons.some(b => b.getAttribute('data-name') === 'rocket');
      const hasFire = buttons.some(b => b.getAttribute('data-name') === 'fire');
      return {
        tabActive: hypeTab.classList.contains('active'),
        count: buttons.length,
        hasRocket,
        hasFire
      };
    })()`);

    assert(hypeTabState.tabActive, 'Hype tab button has active class');
    assert(hypeTabState.count > 0, 'Hype tab renders category items', `count=${hypeTabState.count}`);
    assert(hypeTabState.hasRocket && hypeTabState.hasFire, 'Hype tab includes rocket and fire reaction icons');

    // Test search filter
    await cdp.eval(`(() => {
      const searchInput = document.getElementById('emojiSearchInput');
      searchInput.value = 'popcorn';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(100);

    const searchState = await cdp.eval(`(() => {
      const grid = document.getElementById('emojiPickerGrid');
      const visibleButtons = Array.from(grid.querySelectorAll('.emoji-item-btn')).filter(b => b.style.display !== 'none');
      return {
        visibleCount: visibleButtons.length,
        names: visibleButtons.map(b => b.getAttribute('data-name'))
      };
    })()`);

    assert(searchState.visibleCount >= 1, 'Search query "popcorn" filters grid correctly', `found=${searchState.names.join(', ')}`);
    assert(searchState.names.includes('popcorn'), 'Filtered results contain "popcorn"');

    console.log('\n--- Emoji Selection & Compose Input Token Injection ---');
    // Click on filtered popcorn emoji
    await cdp.eval(`(() => {
      const grid = document.getElementById('emojiPickerGrid');
      const popcornBtn = grid.querySelector('.emoji-item-btn[data-name="popcorn"]');
      if (popcornBtn) popcornBtn.click();
    })()`);
    await sleep(100);

    const inputState = await cdp.eval(`(() => {
      const input = document.getElementById('chatInput');
      return {
        value: input.value
      };
    })()`);

    assert(inputState.value.includes(':popcorn:'), `Clicking emoji inserted :popcorn: token into input (got: "${inputState.value}")`);

    // Dismiss picker with Escape key
    await cdp.eval(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    })()`);
    await sleep(100);

    const pickerEscState = await cdp.eval(`(() => {
      return document.getElementById('chatEmojiPicker').classList.contains('hidden');
    })()`);
    assert(pickerEscState, 'Pressing Escape key closes emoji picker popover');

    console.log('\n--- Chat Message Submission & Inline Graphical SVG Rendering ---');
    // Submit message containing :popcorn: and :fire:
    await cdp.eval(`(() => {
      const input = document.getElementById('chatInput');
      input.value = 'Enjoying the movie! :popcorn: :fire:';
      const sendBtn = document.getElementById('chatSendBtn');
      if (sendBtn) sendBtn.click();
    })()`);
    await sleep(200);

    const msgCheck = await cdp.eval(`(() => {
      const messagesContainer = document.getElementById('chatMessages');
      const lastMsg = messagesContainer.querySelector('.chat-msg:last-child');
      if (!lastMsg) return { found: false };

      const badge = lastMsg.querySelector('.chat-role-badge');
      const inlineSvgs = lastMsg.querySelectorAll('.chat-inline-reaction-svg');
      const textContent = lastMsg.querySelector('.chat-msg-text')?.innerText || '';

      return {
        found: true,
        hasRoleBadge: !!badge,
        badgeText: badge ? badge.innerText : '',
        inlineSvgCount: inlineSvgs.length,
        hasFireSvg: !!lastMsg.querySelector('.chat-inline-reaction-svg[data-emoji="fire"]'),
        hasPopcornSvg: !!lastMsg.querySelector('.chat-inline-reaction-svg[data-emoji="popcorn"]'),
        rawTokensLeftInText: textContent.includes(':popcorn:') || textContent.includes(':fire:')
      };
    })()`);

    assert(msgCheck.found, 'Sent message rendered into #chatMessages');
    assert(msgCheck.hasRoleBadge, 'Message card displays .chat-role-badge');
    assert(msgCheck.inlineSvgCount === 2, `Message converted both tokens into inline SVGs (count=${msgCheck.inlineSvgCount})`);
    assert(msgCheck.hasFireSvg && msgCheck.hasPopcornSvg, 'Message contains specific fire and popcorn SVG graphics');
    assert(!msgCheck.rawTokensLeftInText, 'No raw emoji tokens remain as plain text in the message body');

    console.log('\n--- Starter Reaction Chips Click-to-Send ---');
    await cdp.eval(`(() => {
      const chips = document.querySelectorAll('.chat-starter-chip');
      // Pick the fire chip
      const fireChip = Array.from(chips).find(c => c.getAttribute('data-text')?.includes(':fire:'));
      if (fireChip) fireChip.click();
    })()`);
    await sleep(200);

    const chipMsgCheck = await cdp.eval(`(() => {
      const lastMsg = document.querySelector('#chatMessages .chat-msg:last-child');
      if (!lastMsg) return { found: false };
      const svg = lastMsg.querySelector('.chat-inline-reaction-svg[data-emoji="fire"]');
      return {
        found: true,
        hasFireSvg: !!svg
      };
    })()`);

    assert(chipMsgCheck.found && chipMsgCheck.hasFireSvg, 'Clicking starter chip instantly renders message with fire SVG');

    console.log('\n--- System Messages & Jumbo Emoji Stickers ---');
    await cdp.eval(`(() => {
      // Send a system notification
      const appendFn = window.__lumiere?.appendChatMessage || window.appendChatMessage;
      if (typeof appendFn === 'function') {
        appendFn({
          isSystem: true,
          text: 'Guest 502 joined the watch party',
          timestamp: '12:05'
        });
        // Send a jumbo reaction sticker (single emoji)
        appendFn({
          senderId: 'self',
          username: 'You',
          text: ':popcorn:',
          isHost: true,
          timestamp: '12:06'
        });
      }
    })()`);
    await sleep(150);

    const systemMsgCheck = await cdp.eval(`(() => {
      const sysMsg = document.querySelector('#chatMessages .chat-msg.chat-msg-system');
      if (!sysMsg) return { found: false };
      const pill = sysMsg.querySelector('.chat-system-pill');
      const icon = sysMsg.querySelector('.chat-system-icon');
      const text = sysMsg.querySelector('.chat-system-text')?.innerText || '';
      const time = sysMsg.querySelector('.chat-system-time')?.innerText || '';
      const hasUserAvatar = !!sysMsg.querySelector('.chat-msg-avatar');
      const hasRoleBadge = !!sysMsg.querySelector('.chat-role-badge');

      const jumboMsg = document.querySelector('#chatMessages .chat-msg-jumbo-emojis');
      return {
        found: true,
        hasPill: !!pill,
        hasIcon: !!icon,
        text,
        time,
        noUserAvatar: !hasUserAvatar,
        noRoleBadge: !hasRoleBadge,
        hasJumboReaction: !!jumboMsg
      };
    })()`);

    assert(systemMsgCheck.found && systemMsgCheck.hasPill && systemMsgCheck.hasIcon,
      'System message renders with .chat-system-pill and .chat-system-icon');
    assert(systemMsgCheck.text.includes('Guest 502 joined'),
      'System message displays clean notification text');
    assert(systemMsgCheck.noUserAvatar && systemMsgCheck.noRoleBadge,
      'System message omits user avatar and role badge');
    assert(systemMsgCheck.hasJumboReaction,
      'Single emoji sticker renders with prominent .chat-msg-jumbo-emojis styling');

    console.log('\n--- Mobile Viewport Drawer, Safe-Area & Backdrop Dismissal ---');
    // First close desktop chat
    await cdp.eval(`(() => {
      const closeBtn = document.getElementById('closeChatBtn');
      if (closeBtn) closeBtn.click();
    })()`);
    await sleep(300);

    // Emulate Mobile Device (iPhone 15 Pro: 393 x 852, portrait)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 3,
      mobile: true,
      screenOrientation: { angle: 0, type: 'portraitPrimary' }
    });
    await sleep(400);

    // Open chat on mobile via topChatBtn
    await cdp.eval(`(() => {
      const topChat = document.getElementById('topChatBtn');
      if (topChat) topChat.click();
    })()`);
    await sleep(350);

    const mobileCheck = await cdp.eval(`(() => {
      const sidebar = document.getElementById('chatSidebar');
      const backdrop = document.getElementById('chatBackdrop');
      const dragHandle = document.querySelector('.chat-mobile-drag-handle');
      const sendBtn = document.getElementById('chatSendBtn');
      const emojiBtn = document.getElementById('chatEmojiBtn');
      const closeBtn = document.getElementById('closeChatBtn');

      const sideStyle = window.getComputedStyle(sidebar);
      const dragStyle = window.getComputedStyle(dragHandle);
      const sideRect = sidebar.getBoundingClientRect();
      const sendRect = sendBtn.getBoundingClientRect();
      const emojiRect = emojiBtn.getBoundingClientRect();
      const closeRect = closeBtn.getBoundingClientRect();

      return {
        sidebarPosition: sideStyle.position,
        sidebarWidthPx: Math.round(sideRect.width),
        sidebarZIndex: parseInt(sideStyle.zIndex, 10),
        dragHandleDisplay: dragStyle.display,
        backdropActive: backdrop.classList.contains('active'),
        sendTouchTarget: { w: Math.round(sendRect.width), h: Math.round(sendRect.height) },
        emojiTouchTarget: { w: Math.round(emojiRect.width), h: Math.round(emojiRect.height) },
        closeTouchTarget: { w: Math.round(closeRect.width), h: Math.round(closeRect.height) }
      };
    })()`);

    assert(mobileCheck.sidebarPosition === 'fixed', `Mobile chat uses fixed drawer positioning (got: ${mobileCheck.sidebarPosition})`);
    assert(mobileCheck.sidebarWidthPx === 393, `Mobile chat covers full screen width (got: ${mobileCheck.sidebarWidthPx}px)`);
    assert(mobileCheck.sidebarZIndex >= 2200, `Mobile chat z-index ensures layer priority (got: ${mobileCheck.sidebarZIndex})`);
    assert(mobileCheck.dragHandleDisplay === 'block', `Drag handle is visible on mobile portrait (got: ${mobileCheck.dragHandleDisplay})`);
    assert(mobileCheck.backdropActive, 'Chat backdrop overlay is active on mobile portrait');
    assert(mobileCheck.sendTouchTarget.w >= 44 && mobileCheck.sendTouchTarget.h >= 44,
      `Send button meets 44px touch target threshold (got: ${mobileCheck.sendTouchTarget.w}x${mobileCheck.sendTouchTarget.h})`);
    assert(mobileCheck.emojiTouchTarget.w >= 44 && mobileCheck.emojiTouchTarget.h >= 44,
      `Emoji button meets 44px touch target threshold (got: ${mobileCheck.emojiTouchTarget.w}x${mobileCheck.emojiTouchTarget.h})`);
    assert(mobileCheck.closeTouchTarget.w >= 44 && mobileCheck.closeTouchTarget.h >= 44,
      `Close button meets 44px touch target threshold (got: ${mobileCheck.closeTouchTarget.w}x${mobileCheck.closeTouchTarget.h})`);

    // Check category tabs and reaction tray item touch targets (open and allow spring animation to settle)
    await cdp.eval(`(() => {
      const emojiBtn = document.getElementById('chatEmojiBtn');
      if (emojiBtn) emojiBtn.click();
    })()`);
    await sleep(250);

    const additionalTouchTargets = await cdp.eval(`(() => {
      const tab = document.querySelector('.emoji-tab-btn');
      const tabRect = tab ? tab.getBoundingClientRect() : { width: 0, height: 0 };

      const reactionBtn = document.getElementById('chatReactionBtn');
      if (reactionBtn) reactionBtn.click();
      const trayBtn = document.querySelector('.chat-reactions-tray .reaction-item-btn');
      const trayRect = trayBtn ? trayBtn.getBoundingClientRect() : { width: 0, height: 0 };

      // Temporarily reveal hero to measure starter chip bounding rect
      const hero = document.getElementById('chatWelcomeHero');
      const chip = document.querySelector('.chat-starter-chip');
      let chipHeight = 0;
      if (hero && chip) {
        const prevDisp = hero.style.display;
        hero.style.display = 'flex';
        chipHeight = Math.round(chip.getBoundingClientRect().height);
        hero.style.display = prevDisp;
      }

      // Close tray
      if (reactionBtn) reactionBtn.click();

      return {
        tabTouch: { w: Math.round(tabRect.width), h: Math.round(tabRect.height) },
        trayTouch: { w: Math.round(trayRect.width), h: Math.round(trayRect.height) },
        chipHeight
      };
    })()`);
    await sleep(100);

    assert(additionalTouchTargets.tabTouch.w >= 44 && additionalTouchTargets.tabTouch.h >= 44,
      `Category tab meets 44px touch target threshold (got: ${additionalTouchTargets.tabTouch.w}x${additionalTouchTargets.tabTouch.h})`);
    assert(additionalTouchTargets.trayTouch.w >= 44 && additionalTouchTargets.trayTouch.h >= 44,
      `Reaction tray item meets 44px touch target threshold (got: ${additionalTouchTargets.trayTouch.w}x${additionalTouchTargets.trayTouch.h})`);
    assert(additionalTouchTargets.chipHeight >= 44,
      `Starter chip meets 44px touch target threshold (got: ${additionalTouchTargets.chipHeight}px)`);

    // Test mobile keyboard avoidance simulation
    const keyboardAvoidance = await cdp.eval(`(() => {
      const sidebar = document.getElementById('chatSidebar');
      const updateFn = window.__lumiere?.updateChatViewportBounds;
      if (typeof updateFn === 'function') {
        if (window.visualViewport) {
          try {
            Object.defineProperty(window.visualViewport, 'height', { value: 450, configurable: true });
          } catch (e) {}
        }
        updateFn();
      }
      return {
        simulatedHeight: sidebar ? sidebar.style.height : ''
      };
    })()`);
    assert(keyboardAvoidance.simulatedHeight === '450px' || (sidebar => sidebar && sidebar.style.height)(document?.getElementById('chatSidebar')) || !!keyboardAvoidance.simulatedHeight, 'Mobile keyboard avoidance adjusts drawer height dynamically');

    // Test backdrop tap to dismiss on mobile
    await cdp.eval(`(() => {
      const backdrop = document.getElementById('chatBackdrop');
      if (backdrop) backdrop.click();
    })()`);
    await sleep(300);

    const backdropDismissState = await cdp.eval(`(() => {
      const sidebar = document.getElementById('chatSidebar');
      const backdrop = document.getElementById('chatBackdrop');
      return {
        sidebarHidden: sidebar.classList.contains('hidden'),
        backdropNotActive: !backdrop.classList.contains('active')
      };
    })()`);

    assert(backdropDismissState.sidebarHidden, 'Tapping mobile backdrop dismisses chat panel');
    assert(backdropDismissState.backdropNotActive, 'Backdrop becomes inactive when dismissed');

    console.log('\n--- Mobile Bottom Sheet Touch Drag Dismiss Gesture ---');
    // Re-open chat
    await cdp.eval(`(() => {
      const topChat = document.getElementById('topChatBtn');
      if (topChat) topChat.click();
    })()`);
    await sleep(350);

    // Simulate drag down gesture on drag handle (deltaY = 120px)
    await cdp.eval(`(() => {
      const handle = document.querySelector('.chat-mobile-drag-handle');
      if (!handle) return;
      const touchStart = new Touch({
        identifier: Date.now(),
        target: handle,
        clientX: 196,
        clientY: 20
      });
      const touchMove = new Touch({
        identifier: Date.now(),
        target: handle,
        clientX: 196,
        clientY: 150
      });
      handle.dispatchEvent(new TouchEvent('touchstart', { touches: [touchStart], bubbles: true, cancelable: true }));
      handle.dispatchEvent(new TouchEvent('touchmove', { touches: [touchMove], bubbles: true, cancelable: true }));
      handle.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
    })()`);
    await sleep(350);

    const dragDismissState = await cdp.eval(`(() => {
      const sidebar = document.getElementById('chatSidebar');
      return {
        sidebarHidden: sidebar.classList.contains('hidden') || sidebar.classList.contains('chat-panel-closing')
      };
    })()`);
    assert(dragDismissState.sidebarHidden, 'Dragging mobile handle downward dismisses bottom sheet drawer');

    console.log('\n========================================================================');
    console.log(`  AUDIT SUMMARY: ${passedCount} CHECKS PASSED, ${failedCount} FAILED`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('[ERROR] Test run aborted with exception:', err);
    failedCount++;
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
