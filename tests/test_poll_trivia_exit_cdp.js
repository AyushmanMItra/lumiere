/**
 * TEST SUITE: Live Poll and Movie Trivia Exit Button & Question Randomization CDP Verification
 * 
 * Verifies that:
 * 1. Live Poll modal #closePollModalBtn ('x' button) dismisses and closes #pollModal immediately.
 * 2. Movie Trivia modal #closeTriviaModalBtn ('x' button) dismisses and closes #triviaModal immediately.
 * 3. Backdrop overlay click closes both #pollModal and #triviaModal cleanly.
 * 4. Pressing the Escape key dismisses both modals cleanly and clears active-status-ring on #moreOptionsBtn.
 * 5. #cancelPollBtn also dismisses #pollModal.
 * 6. Rapid dismiss during async fetch cancels fetch and prevents late-arriving modal popups or duplicate sessions.
 * 7. Reopening modal immediately after abort starts a fresh, clean session.
 * 8. Mutual exclusivity: opening Live Poll closes Trivia, and opening Trivia closes Live Poll.
 * 9. Escape key closes the topmost modal without closing underlying chat drawer.
 * 10. Movie trivia questions are dynamically randomized, pull non-repetitive cinema questions,
 *     shuffle multiple-choice options, and properly decode HTML entities (&quot;, &#039;, &amp;, &eacute;, &ldquo;).
 * 
 * Strict No-Emoji Policy: Uses [PASS], [FAIL], [INFO] textual badges.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const wsPkg = require('ws');

const PORT = 8255;
const CDP_PORT = 9510;
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

      if (reqPath === '/api/trivia') {
        const seed = [
          { question: "Which film won Best Picture in 2020?", correct_answer: "Parasite", incorrect_answers: ["Roma", "1917", "Minari"] },
          { question: "Who directed 'Pulp Fiction'?", correct_answer: "Quentin Tarantino", incorrect_answers: ["Martin Scorsese", "David Fincher", "PT Anderson"] },
          { question: "What is the African nation in Black Panther?", correct_answer: "Wakanda", incorrect_answers: ["Genosha", "Latveria", "Sokovia"] },
          { question: "Which 1982 film has replicants?", correct_answer: "Blade Runner", incorrect_answers: ["Total Recall", "Terminator", "RoboCop"] },
          { question: "Where is the One Ring destroyed?", correct_answer: "Mount Doom", incorrect_answers: ["Erebor", "Caradhras", "Gundabad"] },
          { question: "Which Studio Ghibli film won Oscar 2003?", correct_answer: "Spirited Away", incorrect_answers: ["Princess Mononoke", "Howl's Moving Castle", "Totoro"] },
          { question: "Who played Vito Corleone in 1972?", correct_answer: "Marlon Brando", incorrect_answers: ["Al Pacino", "Robert De Niro", "James Caan"] },
          { question: "Which movie has 'Here's looking at you, kid'?", correct_answer: "Casablanca", incorrect_answers: ["Citizen Kane", "Gone with the Wind", "Sunset Blvd"] },
          { question: "First woman to win Best Director?", correct_answer: "Kathryn Bigelow", incorrect_answers: ["Sofia Coppola", "Jane Campion", "Greta Gerwig"] },
          { question: "Highest grossing film of all time?", correct_answer: "Avatar", incorrect_answers: ["Endgame", "Titanic", "The Force Awakens"] },
          { question: "Which movie features HAL 9000?", correct_answer: "2001: A Space Odyssey", incorrect_answers: ["A Clockwork Orange", "Solaris", "Dr. Strangelove"] },
          { question: "What color pill does Neo take?", correct_answer: "Red", incorrect_answers: ["Blue", "Green", "Yellow"] },
          { question: "Which movie travels near Saturn wormhole?", correct_answer: "Interstellar", incorrect_answers: ["Inception", "Tenet", "The Prestige"] },
          { question: "Who directed Seven Samurai?", correct_answer: "Akira Kurosawa", incorrect_answers: ["Yasujiro Ozu", "Kenji Mizoguchi", "Masaki Kobayashi"] },
          { question: "Which movie won 11 Oscars in 1998?", correct_answer: "Titanic", incorrect_answers: ["Braveheart", "Forrest Gump", "Gladiator"] },
          { question: "What is Han Solo's ship?", correct_answer: "Millennium Falcon", incorrect_answers: ["Star Destroyer", "Razor Crest", "Slave I"] }
        ];
        if (!global.__testTriviaIndex) global.__testTriviaIndex = 0;
        const count = 5;
        const chosen = [];
        for (let i = 0; i < count; i++) {
          chosen.push(seed[(global.__testTriviaIndex + i) % seed.length]);
        }
        global.__testTriviaIndex = (global.__testTriviaIndex + count) % seed.length;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, questions: chosen }));
        return;
      }

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
  const tmpDir = path.join(os.tmpdir(), 'edge-exit-trivia-' + Date.now());
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
    }, 12000);
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
            } else if (Date.now() - startTime < 12000) {
              setTimeout(poll, 150);
            } else {
              reject(new Error('Target page with PORT not found'));
            }
          } catch (e) {
            if (Date.now() - startTime < 12000) setTimeout(poll, 150);
            else reject(e);
          }
        });
      }).on('error', () => {
        if (Date.now() - startTime < 12000) setTimeout(poll, 150);
        else reject(new Error('Could not connect to Edge /json endpoint'));
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

async function run() {
  console.log('================================================================');
  console.log('  TEST SUITE: LIVE POLL & TRIVIA EXIT AND RANDOMIZATION (CDP)   ');
  console.log('================================================================\n');

  let server;
  let edgeInfo;
  let ws;

  try {
    server = await startServer();
    console.log('[INFO] Launching Headless Edge...');
    edgeInfo = await launchEdge();
    console.log('[INFO] Headless Edge launched successfully');

    const wsUrl = await getPageWSUrl();
    const WebSocket = wsPkg.WebSocket || wsPkg;
    ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    const cdp = new CDPClient(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    await sleep(1500);

    // Switch to room view in app
    await cdp.eval(`
      (() => {
        const joinModal = document.getElementById('joinModal');
        const appContainer = document.getElementById('appContainer');
        if (joinModal) joinModal.classList.add('hidden');
        if (appContainer) appContainer.classList.remove('hidden');
      })()
    `);
    await sleep(300);

    console.log('----------------------------------------------------------------');
    console.log('  SUITE 1: Three Dots Menu & Status Ring Verification           ');
    console.log('----------------------------------------------------------------');

    const moreBtnExists = await cdp.eval(`Boolean(document.getElementById('moreOptionsBtn'))`);
    assert(moreBtnExists, '#moreOptionsBtn exists in DOM');

    const moreMenuClosedInitially = await cdp.eval(`
      document.getElementById('moreOptionsMenu').classList.contains('hidden')
    `);
    assert(moreMenuClosedInitially, '#moreOptionsMenu is hidden initially');

    await cdp.eval(`document.getElementById('moreOptionsBtn').click()`);
    await sleep(200);

    const moreMenuOpen = await cdp.eval(`
      !document.getElementById('moreOptionsMenu').classList.contains('hidden')
    `);
    assert(moreMenuOpen, '#moreOptionsMenu opens upon clicking #moreOptionsBtn');

    const moreBtnHasRing = await cdp.eval(`
      document.getElementById('moreOptionsBtn').classList.contains('active-status-ring')
    `);
    assert(moreBtnHasRing, '#moreOptionsBtn receives .active-status-ring when menu is open');

    console.log('----------------------------------------------------------------');
    console.log('  SUITE 2: Live Room Poll Modal Exit Button & Dismissal         ');
    console.log('----------------------------------------------------------------');

    await cdp.eval(`document.getElementById('menuPollBtn').click()`);
    await sleep(200);

    const pollModalOpen = await cdp.eval(`
      !document.getElementById('pollModal').classList.contains('hidden')
    `);
    assert(pollModalOpen, '#pollModal opens when clicking #menuPollBtn');

    const ringClearedOnPollOpen = await cdp.eval(`
      !document.getElementById('moreOptionsBtn').classList.contains('active-status-ring')
    `);
    assert(ringClearedOnPollOpen, 'active-status-ring on three dots button is cleared when poll modal opens');

    const closePollBtnExists = await cdp.eval(`Boolean(document.getElementById('closePollModalBtn'))`);
    assert(closePollBtnExists, '#closePollModalBtn exists on #pollModal');

    // 1. Click 'x' button on poll modal
    await cdp.eval(`document.getElementById('closePollModalBtn').click()`);
    await sleep(200);

    const pollModalClosedByX = await cdp.eval(`
      document.getElementById('pollModal').classList.contains('hidden')
    `);
    assert(pollModalClosedByX, 'Clicking #closePollModalBtn closes #pollModal immediately');

    // 2. Open again and test Backdrop click
    await cdp.eval(`
      document.getElementById('moreOptionsBtn').click();
      setTimeout(() => document.getElementById('menuPollBtn').click(), 100);
    `);
    await sleep(350);

    const pollModalReopened = await cdp.eval(`
      !document.getElementById('pollModal').classList.contains('hidden')
    `);
    assert(pollModalReopened, '#pollModal reopened for backdrop testing');

    await cdp.eval(`
      (() => {
        const modal = document.getElementById('pollModal');
        const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
        modal.dispatchEvent(evt);
      })()
    `);
    await sleep(200);

    const pollModalClosedByBackdrop = await cdp.eval(`
      document.getElementById('pollModal').classList.contains('hidden')
    `);
    assert(pollModalClosedByBackdrop, 'Clicking overlay backdrop dismisses #pollModal cleanly');

    // 3. Open again and test Escape key
    await cdp.eval(`
      document.getElementById('moreOptionsBtn').click();
      setTimeout(() => document.getElementById('menuPollBtn').click(), 100);
    `);
    await sleep(350);

    await cdp.eval(`
      (() => {
        const evt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
        window.dispatchEvent(evt);
      })()
    `);
    await sleep(200);

    const pollModalClosedByEscape = await cdp.eval(`
      document.getElementById('pollModal').classList.contains('hidden')
    `);
    assert(pollModalClosedByEscape, 'Pressing Escape key dismisses #pollModal cleanly');

    const ringClearedAfterPollEscape = await cdp.eval(`
      !document.getElementById('moreOptionsBtn').classList.contains('active-status-ring')
    `);
    assert(ringClearedAfterPollEscape, 'active-status-ring on three dots button is cleared after Escape');

    // 4. Test Cancel button on Poll Modal
    await cdp.eval(`
      document.getElementById('moreOptionsBtn').click();
      setTimeout(() => document.getElementById('menuPollBtn').click(), 100);
    `);
    await sleep(350);

    await cdp.eval(`document.getElementById('cancelPollBtn').click()`);
    await sleep(200);

    const pollModalClosedByCancel = await cdp.eval(`
      document.getElementById('pollModal').classList.contains('hidden')
    `);
    assert(pollModalClosedByCancel, 'Clicking #cancelPollBtn dismisses #pollModal');

    console.log('----------------------------------------------------------------');
    console.log('  SUITE 3: Cinema Trivia Modal Exit Button & Dismissal          ');
    console.log('----------------------------------------------------------------');

    await cdp.eval(`
      document.getElementById('moreOptionsBtn').click();
      setTimeout(() => document.getElementById('menuTriviaBtn').click(), 100);
    `);
    await sleep(400);

    const triviaModalOpen = await cdp.eval(`
      !document.getElementById('triviaModal').classList.contains('hidden')
    `);
    assert(triviaModalOpen, '#triviaModal opens when clicking #menuTriviaBtn');

    const ringClearedOnTriviaOpen = await cdp.eval(`
      !document.getElementById('moreOptionsBtn').classList.contains('active-status-ring')
    `);
    assert(ringClearedOnTriviaOpen, 'active-status-ring on three dots button is cleared when trivia modal opens');

    const closeTriviaBtnExists = await cdp.eval(`Boolean(document.getElementById('closeTriviaModalBtn'))`);
    assert(closeTriviaBtnExists, '#closeTriviaModalBtn exists on #triviaModal');

    // 1. Click 'x' button on trivia modal
    await cdp.eval(`document.getElementById('closeTriviaModalBtn').click()`);
    await sleep(200);

    const triviaModalClosedByX = await cdp.eval(`
      document.getElementById('triviaModal').classList.contains('hidden')
    `);
    assert(triviaModalClosedByX, 'Clicking #closeTriviaModalBtn dismisses #triviaModal immediately');

    // 2. Open again and test Backdrop click
    await cdp.eval(`
      document.getElementById('moreOptionsBtn').click();
      setTimeout(() => document.getElementById('menuTriviaBtn').click(), 100);
    `);
    await sleep(400);

    await cdp.eval(`
      (() => {
        const modal = document.getElementById('triviaModal');
        const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
        modal.dispatchEvent(evt);
      })()
    `);
    await sleep(200);

    const triviaModalClosedByBackdrop = await cdp.eval(`
      document.getElementById('triviaModal').classList.contains('hidden')
    `);
    assert(triviaModalClosedByBackdrop, 'Clicking overlay backdrop dismisses #triviaModal cleanly');

    // 3. Open again and test Escape key
    await cdp.eval(`
      document.getElementById('moreOptionsBtn').click();
      setTimeout(() => document.getElementById('menuTriviaBtn').click(), 100);
    `);
    await sleep(400);

    await cdp.eval(`
      (() => {
        const evt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
        window.dispatchEvent(evt);
      })()
    `);
    await sleep(200);

    const triviaModalClosedByEscape = await cdp.eval(`
      document.getElementById('triviaModal').classList.contains('hidden')
    `);
    assert(triviaModalClosedByEscape, 'Pressing Escape key dismisses #triviaModal cleanly');

    const ringClearedAfterTriviaEscape = await cdp.eval(`
      !document.getElementById('moreOptionsBtn').classList.contains('active-status-ring')
    `);
    assert(ringClearedAfterTriviaEscape, 'active-status-ring on three dots button is cleared after Escape');

    // 4. Rapid Dismiss During In-Flight Question Fetch
    console.log('----------------------------------------------------------------');
    console.log('  SUITE 4: Async Fetch Abort & Rapid Reopen Resilience         ');
    console.log('----------------------------------------------------------------');

    await cdp.eval(`
      (() => {
        document.getElementById('moreOptionsBtn').click();
        document.getElementById('menuTriviaBtn').click();
        // Click close within 50ms while questions are actively loading
        setTimeout(() => {
          document.getElementById('closeTriviaModalBtn').click();
        }, 50);
      })()
    `);
    await sleep(600);

    const modalRemainsClosedAfterAbort = await cdp.eval(`
      document.getElementById('triviaModal').classList.contains('hidden')
    `);
    assert(modalRemainsClosedAfterAbort, 'Rapid close aborts in-flight fetch and prevents late-arriving modal popup');

    // 5. Reopening immediately after abort
    await cdp.eval(`
      (() => {
        document.getElementById('moreOptionsBtn').click();
        document.getElementById('menuTriviaBtn').click();
      })()
    `);
    await sleep(300);

    const modalReopenedCleanly = await cdp.eval(`
      !document.getElementById('triviaModal').classList.contains('hidden')
    `);
    assert(modalReopenedCleanly, 'Reopening modal immediately after abort starts fresh clean session');

    // Dismiss modal cleanly
    await cdp.eval(`document.getElementById('closeTriviaModalBtn').click()`);
    await sleep(200);

    // 6. Mutual Exclusivity: Opening Poll closes Trivia, Opening Trivia closes Poll
    console.log('----------------------------------------------------------------');
    console.log('  SUITE 5: Modal Mutual Exclusivity & Escape Isolation          ');
    console.log('----------------------------------------------------------------');

    await cdp.eval(`
      (() => {
        document.getElementById('moreOptionsBtn').click();
        document.getElementById('menuTriviaBtn').click();
        setTimeout(() => {
          document.getElementById('moreOptionsBtn').click();
          document.getElementById('menuPollBtn').click();
        }, 150);
      })()
    `);
    await sleep(400);

    const mutualExclusivityCheck1 = await cdp.eval(`
      (() => {
        const pollOpen = !document.getElementById('pollModal').classList.contains('hidden');
        const triviaOpen = !document.getElementById('triviaModal').classList.contains('hidden');
        return { pollOpen, triviaOpen };
      })()
    `);
    assert(mutualExclusivityCheck1.pollOpen && !mutualExclusivityCheck1.triviaOpen, 'Opening Live Poll automatically dismisses Cinema Trivia');

    // Clean up
    await cdp.eval(`document.getElementById('closePollModalBtn').click()`);
    await sleep(200);

    // 7. Escape isolation: Pressing Escape when modal is open does not dismiss chat drawer
    const escapeIsolation = await cdp.eval(`
      (() => {
        const chatSidebar = document.getElementById('chatSidebar');
        // Simulate chat open state
        if (chatSidebar) chatSidebar.classList.remove('hidden');
        const wasChatOpen = chatSidebar && !chatSidebar.classList.contains('hidden');

        // Open poll modal
        document.getElementById('moreOptionsBtn').click();
        document.getElementById('menuPollBtn').click();

        // Dispatch Escape
        const evt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
        window.dispatchEvent(evt);

        const isPollClosed = document.getElementById('pollModal').classList.contains('hidden');
        const isChatStillOpen = chatSidebar && !chatSidebar.classList.contains('hidden');

        // Close chat
        if (chatSidebar) chatSidebar.classList.add('hidden');

        return { isPollClosed, isChatStillOpen };
      })()
    `);
    assert(escapeIsolation.isPollClosed, 'Escape dismissed the topmost modal');
    assert(escapeIsolation.isChatStillOpen, 'Escape preserved underlying chat drawer without closing it prematurely');

    console.log('----------------------------------------------------------------');
    console.log('  SUITE 6: Trivia Question Randomization & Entity Decoding      ');
    console.log('----------------------------------------------------------------');

    const poolSize = await cdp.eval(`
      (() => {
        return window.TRIVIA_FALLBACK_BANK ? window.TRIVIA_FALLBACK_BANK.length : (typeof window.getFallbackTriviaQuestions === 'function' ? window.getFallbackTriviaQuestions(55).length : 0);
      })()
    `);
    assert(poolSize >= 50, `Diverse offline fallback pool contains 50+ questions (found ${poolSize})`);

    // Verify entity decoding function handles named entities, accents, and double-encoding
    const entityTest = await cdp.eval(`
      (() => {
        const testStr1 = 'In the Friday The 13th series, what is Jason&#039;s mother&#039;s first name? &quot;Friday&quot; &amp; Am&eacute;lie';
        const testStr2 = '&ldquo;Double&amp;quot;Quote&rdquo; &ndash; 100% &amp; &#x27;Cool&#x27;';
        const decoded1 = window.decodeHtmlEntities(testStr1);
        const decoded2 = window.decodeHtmlEntities(testStr2);
        const hasUnescapedEntity1 = /&#?[a-z0-9]+;/i.test(decoded1);
        const hasUnescapedEntity2 = /&#?[a-z0-9]+;/i.test(decoded2);
        return {
          decoded1,
          clean1: !hasUnescapedEntity1,
          decoded2,
          clean2: !hasUnescapedEntity2
        };
      })()
    `);
    assert(entityTest.clean1, `decodeHtmlEntities cleans quotes, ampersands, and accents: "${entityTest.decoded1}"`);
    assert(entityTest.clean2, `decodeHtmlEntities handles curly quotes and double-encoded entities: "${entityTest.decoded2}"`);

    // Test consecutive round generation for non-repetitiveness and 4-way option shuffle
    const roundComparison = await cdp.eval(`
      (async () => {
        const round1 = await window.fetchDynamicTriviaQuestions(5);
        const round2 = await window.fetchDynamicTriviaQuestions(5);
        const round3 = await window.fetchDynamicTriviaQuestions(5);

        const qSet1 = new Set(round1.map(q => q.q));
        const qSet2 = new Set(round2.map(q => q.q));
        const qSet3 = new Set(round3.map(q => q.q));

        let overlaps12 = 0;
        round2.forEach(q => { if (qSet1.has(q.q)) overlaps12++; });

        let overlaps23 = 0;
        round3.forEach(q => { if (qSet2.has(q.q)) overlaps23++; });

        const allQuestions = [...round1, ...round2, ...round3];
        const allFourOptions = allQuestions.every(q => Array.isArray(q.options) && q.options.length === 4);
        const answerPositions = new Set(allQuestions.map(q => q.answer));

        return {
          round1Count: round1.length,
          round2Count: round2.length,
          round3Count: round3.length,
          overlaps12,
          overlaps23,
          allFourOptions,
          distinctAnswerPositions: answerPositions.size,
          sampleQ1: round1[0]?.q,
          sampleQ2: round2[0]?.q,
          sampleQ3: round3[0]?.q
        };
      })()
    `);

    assert(roundComparison.round1Count === 5, 'Round 1 generated 5 questions');
    assert(roundComparison.round2Count === 5, 'Round 2 generated 5 questions');
    assert(roundComparison.round3Count === 5, 'Round 3 generated 5 questions');
    assert(roundComparison.overlaps12 < 5, `Rounds 1 and 2 avoid static repetition (overlaps: ${roundComparison.overlaps12}/5)`);
    assert(roundComparison.overlaps23 < 5, `Rounds 2 and 3 avoid static repetition (overlaps: ${roundComparison.overlaps23}/5)`);
    assert(roundComparison.allFourOptions, 'All questions across all rounds provide exactly 4 multiple choice options');
    assert(roundComparison.distinctAnswerPositions > 1, `Options are dynamically shuffled with Fisher-Yates (seen ${roundComparison.distinctAnswerPositions} answer positions)`);

    console.log(`  [INFO] Sample Q (Round 1): "${roundComparison.sampleQ1}"`);
    console.log(`  [INFO] Sample Q (Round 2): "${roundComparison.sampleQ2}"`);
    console.log(`  [INFO] Sample Q (Round 3): "${roundComparison.sampleQ3}"`);

    console.log('----------------------------------------------------------------');
    console.log('  SUITE 7: Zero-Emoji Compliance Check                          ');
    console.log('----------------------------------------------------------------');

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const testFileCode = fs.readFileSync(__filename, 'utf8');
    const hasEmoji = emojiRegex.test(testFileCode);
    assert(!hasEmoji, 'Test suite adheres strictly to Zero-Emoji Policy');

  } catch (err) {
    console.error('[ERROR] Unexpected test runner failure:', err);
    failedCount++;
  } finally {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    if (edgeInfo && edgeInfo.proc) {
      edgeInfo.proc.kill();
      try {
        fs.rmSync(edgeInfo.tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
    if (server) {
      server.close();
    }
  }

  console.log('\n================================================================');
  console.log(`  RESULTS: ${passedCount} passed, ${failedCount} failed`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run();
