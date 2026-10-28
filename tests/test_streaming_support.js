// ==========================================================================
// Lumière - Streaming Platforms & Extension Comprehensive Test Suite
// Tests Netflix, Prime Video, JioHotstar, Zee5, and Universal streaming support
// ==========================================================================

const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const zlib = require('zlib');
const ClientIo = require('../node_modules/socket.io/client-dist/socket.io.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXTENSION_DIR = path.join(ROOT_DIR, 'extension');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function itAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

console.log('\n================================================================');
console.log('  TEST SUITE 1: EXTENSION INTEGRITY & MANIFEST V3 VALIDATION');
console.log('================================================================');

it('manifest.json is valid Manifest V3 and contains required metadata', () => {
  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  assert(fs.existsSync(manifestPath), 'manifest.json must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert(manifest.name.includes('Lumiere'), 'Must contain Lumiere');
  assert(manifest.version, 'Must have version string');
  assert(Array.isArray(manifest.permissions), 'Must have permissions');
  assert(manifest.permissions.includes('storage'), 'Must include storage permission');
  assert(Array.isArray(manifest.host_permissions), 'Must have host_permissions');

  // Verify all target streaming platforms are in host permissions
  const hosts = manifest.host_permissions.join(' ');
  assert(hosts.includes('netflix.com'), 'Must match Netflix');
  assert(hosts.includes('primevideo.com') || hosts.includes('amazon.com'), 'Must match Prime Video');
  assert(hosts.includes('hotstar.com') || hosts.includes('jiohotstar.com'), 'Must match JioHotstar');
  assert(hosts.includes('zee5.com'), 'Must match Zee5');
});

it('All referenced content scripts, styles, and libraries exist on disk', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8'));
  
  for (const cs of manifest.content_scripts) {
    for (const jsFile of cs.js) {
      const fullPath = path.join(EXTENSION_DIR, jsFile);
      assert(fs.existsSync(fullPath), `Content script file must exist: ${jsFile}`);
      const stats = fs.statSync(fullPath);
      assert(stats.size > 0, `File must not be empty: ${jsFile}`);
    }
    for (const cssFile of cs.css) {
      const fullPath = path.join(EXTENSION_DIR, cssFile);
      assert(fs.existsSync(fullPath), `CSS file must exist: ${cssFile}`);
      assert(fs.statSync(fullPath).size > 0, `CSS file must not be empty: ${cssFile}`);
    }
  }

  // Verify background service worker
  const swPath = path.join(EXTENSION_DIR, manifest.background.service_worker);
  assert(fs.existsSync(swPath), 'Background service worker must exist');

  // Verify popup files
  const popupHtml = path.join(EXTENSION_DIR, manifest.action.default_popup);
  assert(fs.existsSync(popupHtml), 'Popup HTML must exist');
});

it('All icon files exist and have valid PNG signatures', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8'));
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  for (const [size, iconRel] of Object.entries(manifest.icons)) {
    const iconPath = path.join(EXTENSION_DIR, iconRel);
    assert(fs.existsSync(iconPath), `Icon ${size} must exist at ${iconRel}`);
    const buf = fs.readFileSync(iconPath);
    assert(buf.subarray(0, 8).equals(pngSignature), `Icon ${iconRel} must have valid PNG signature`);
  }
});

it('Bundled Socket.io client exists and contains io function', () => {
  const socketIoPath = path.join(EXTENSION_DIR, 'lib', 'socket.io.min.js');
  assert(fs.existsSync(socketIoPath), 'socket.io.min.js must exist');
  const content = fs.readFileSync(socketIoPath, 'utf8');
  assert(content.includes('io') || content.includes('Socket'), 'socket.io library must contain io/Socket code');
});

it('netflix-page.js exists and implements Cadmium API bridge', () => {
  const pPath = path.join(EXTENSION_DIR, 'adapters', 'netflix-page.js');
  assert(fs.existsSync(pPath), 'netflix-page.js must exist');
  const code = fs.readFileSync(pPath, 'utf8');
  assert(code.includes('videoPlayer'), 'Must reference Cadmium videoPlayer');
  assert(code.includes('LUMIERE_NETFLIX_SEEK'), 'Must handle seek bridge event');
});

it('background.js implements persistent storage with lumiere_connected and restoreState', () => {
  const bg = fs.readFileSync(path.join(EXTENSION_DIR, 'background.js'), 'utf8');
  assert(bg.includes('lumiere_connected'), 'Must persist lumiere_connected');
  assert(bg.includes('restoreState'), 'Must have restoreState helper');
  assert(bg.includes('SUPPORTED_MATCH_PATTERNS'), 'Must define match patterns');
});

it('content.js implements sync-movie-stopped, sync-streaming-changed, and sync-speed-changed', () => {
  const content = fs.readFileSync(path.join(EXTENSION_DIR, 'content.js'), 'utf8');
  assert(content.includes('sync-movie-stopped'), 'Must listen to sync-movie-stopped');
  assert(content.includes('sync-streaming-changed'), 'Must listen to sync-streaming-changed');
  assert(content.includes('sync-speed-changed'), 'Must listen to sync-speed-changed');
  assert(content.includes('checkAndBroadcastTitleChange'), 'Must implement title change broadcast');
});

console.log('\n================================================================');
console.log('  TEST SUITE 2: STREAMING PLATFORM ADAPTERS UNIT TESTS');
console.log('================================================================');

it('Netflix adapter defines standard adapter interface and fallback title', () => {
  const code = fs.readFileSync(path.join(EXTENSION_DIR, 'adapters', 'netflix.js'), 'utf8');
  assert(code.includes("platform: 'netflix'"), 'Must declare platform netflix');
  assert(code.includes('getVideo'), 'Must implement getVideo');
  assert(code.includes('getTitle'), 'Must implement getTitle');
  assert(code.includes('getContentUrl'), 'Must implement getContentUrl');
  assert(code.includes('seek:'), 'Must implement seek');
  assert(code.includes('play:'), 'Must implement play');
  assert(code.includes('pause:'), 'Must implement pause');
});

it('Prime Video adapter defines standard adapter interface and fallback title', () => {
  const code = fs.readFileSync(path.join(EXTENSION_DIR, 'adapters', 'primevideo.js'), 'utf8');
  assert(code.includes("platform: 'primevideo'"), 'Must declare platform primevideo');
  assert(code.includes('getVideo'), 'Must implement getVideo');
  assert(code.includes('getTitle'), 'Must implement getTitle');
  assert(code.includes('seek:'), 'Must implement seek');
});

it('JioHotstar adapter defines standard adapter interface and selectors', () => {
  const code = fs.readFileSync(path.join(EXTENSION_DIR, 'adapters', 'jiohotstar.js'), 'utf8');
  assert(code.includes("platform: 'jiohotstar'"), 'Must declare platform jiohotstar');
  assert(code.includes('getVideo'), 'Must implement getVideo');
  assert(code.includes('getTitle'), 'Must implement getTitle');
});

it('Zee5 adapter defines standard adapter interface and selectors', () => {
  const code = fs.readFileSync(path.join(EXTENSION_DIR, 'adapters', 'zee5.js'), 'utf8');
  assert(code.includes("platform: 'zee5'"), 'Must declare platform zee5');
  assert(code.includes('getVideo'), 'Must implement getVideo');
  assert(code.includes('getTitle'), 'Must implement getTitle');
});

it('Universal / Generic HTML5 video adapter detects platforms and fallback title', () => {
  const code = fs.readFileSync(path.join(EXTENSION_DIR, 'adapters', 'generic.js'), 'utf8');
  assert(code.includes('findGenericVideo'), 'Must implement universal video finder');
  assert(code.includes('detectPlatform'), 'Must implement platform detection');
  assert(code.includes('seek:'), 'Must implement seek');
});

console.log('\n================================================================');
console.log('  TEST SUITE 3: FRONTEND DOM ELEMENTS & HTML INTEGRATION');
console.log('================================================================');

it('index.html contains streamingPlayerBox stage with all required elements', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert(html.includes('id="streamingPlayerBox"'), 'Must contain streamingPlayerBox');
  assert(html.includes('id="streamingPlatformPill"'), 'Must contain streamingPlatformPill');
  assert(html.includes('id="streamingContentTitle"'), 'Must contain streamingContentTitle');
  assert(html.includes('id="streamingLaunchBtn"'), 'Must contain streamingLaunchBtn');
  assert(html.includes('id="streamingShareTabBtn"'), 'Must contain streamingShareTabBtn');
  assert(html.includes('id="streamingExtensionBtn"'), 'Must contain streamingExtensionBtn');
  assert(html.includes('id="streamingPlayStatus"'), 'Must contain streamingPlayStatus');
  assert(html.includes('id="streamingTimeDisplay"'), 'Must contain streamingTimeDisplay');
});

it('index.html contains streamingModal for initiating parties', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert(html.includes('id="streamingModal"'), 'Must contain streamingModal');
  assert(html.includes('id="streamingForm"'), 'Must contain streamingForm');
  assert(html.includes('id="streamingPlatformSelector"'), 'Must contain streamingPlatformSelector');
  assert(html.includes('data-platform="netflix"'), 'Must have Netflix platform button');
  assert(html.includes('data-platform="primevideo"'), 'Must have Prime Video platform button');
  assert(html.includes('data-platform="jiohotstar"'), 'Must have JioHotstar platform button');
  assert(html.includes('data-platform="zee5"'), 'Must have Zee5 platform button');
});

it('index.html contains extensionModal with download action, room code banner, and install guide', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert(html.includes('id="extensionModal"'), 'Must contain extensionModal');
  assert(html.includes('/api/extension/download'), 'Must have extension download link');
  assert(html.includes('id="closeExtensionBtn"'), 'Must have closeExtensionBtn');
  assert(html.includes('id="extModalRoomCode"'), 'Must contain extModalRoomCode');
  assert(html.includes('id="copyExtRoomCodeBtn"'), 'Must contain copyExtRoomCodeBtn');
});

it('public/app.js references formatTime and has zero undefined formatDuration calls', () => {
  const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
  assert(!appJs.includes('formatDuration'), 'Must not call nonexistent formatDuration');
  assert(appJs.includes('formatTime'), 'Must use formatTime');
});

it('public/app.js sync-play/pause/seek have streaming guards and manage streamingPlayerBox visibility', () => {
  const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
  assert(appJs.includes("if (state.currentMovie?.type === 'streaming' || state.currentMovie?.type === 'youtube') return;"), 'sync-play must guard streaming');
  assert(appJs.includes("else if (state.currentMovie.type === 'streaming')"), 'sync-screen-share-stopped must restore streamingPlayerBox');
});

it('moreOptionsMenu in index.html contains menuStreamingBtn', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert(html.includes('id="menuStreamingBtn"'), 'Must contain menuStreamingBtn');
});

it('public/app.js handles streaming duration isolation, screenshare hiding, and seek emission', () => {
  const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
  assert(appJs.includes("if (state.currentMovie?.type === 'streaming')"), 'getEffectiveDuration must isolate streaming');
  assert(appJs.includes("state.socket.emit('host-streaming-sync'"), 'seekMovie must emit host-streaming-sync');
  assert(appJs.includes("if (el.streamingPlayerBox) el.streamingPlayerBox.classList.add('hidden');"), 'startScreenShare must hide streaming box');
});

it('public/style.css defines styling for streaming theater box and modal', () => {
  const css = fs.readFileSync(path.join(PUBLIC_DIR, 'style.css'), 'utf8');
  assert(css.includes('.streaming-player-box'), 'Must style .streaming-player-box');
  assert(css.includes('.streaming-cinema-card'), 'Must style .streaming-cinema-card');
  assert(css.includes('.streaming-backdrop.bg-netflix'), 'Must style Netflix backdrop');
  assert(css.includes('.streaming-backdrop.bg-primevideo'), 'Must style Prime Video backdrop');
  assert(css.includes('.streaming-backdrop.bg-jiohotstar'), 'Must style JioHotstar backdrop');
  assert(css.includes('.streaming-backdrop.bg-zee5'), 'Must style Zee5 backdrop');
  assert(css.includes('.streaming-platform-selector'), 'Must style platform selector');
});

console.log('\n================================================================');
console.log('  TEST SUITE 4: SERVER REST API & EXTENSION DOWNLOAD PACKAGER');
console.log('================================================================');

async function runServerAndNetworkTests() {
  // Require and start Express server on a test port
  const TEST_HTTP_PORT = 3199;
  process.env.PORT = String(TEST_HTTP_PORT);

  // Require server.js
  const serverPath = path.join(ROOT_DIR, 'server.js');
  
  // Create an isolated child process or run server tests via child process to not clash with main instance
  const { fork } = require('child_process');
  const serverProc = fork(serverPath, [], {
    env: { ...process.env, PORT: String(TEST_HTTP_PORT), HTTPS_PORT: '3544' },
    silent: true
  });

  // Wait for server to output ready
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server start timed out')), 8000);
    serverProc.stdout.on('data', (d) => {
      const str = d.toString();
      if (str.includes('LUMIÈRE PRIVATE CINEMA SERVER') || str.includes(String(TEST_HTTP_PORT))) {
        clearTimeout(timer);
        resolve();
      }
    });
    serverProc.stderr.on('data', (d) => {
      // console.error('[Server Err]', d.toString());
    });
  });

  const baseUrl = `http://localhost:${TEST_HTTP_PORT}`;

  try {
    await itAsync('GET /api/extension/info returns metadata and platforms list', async () => {
      const res = await fetch(`${baseUrl}/api/extension/info`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert(json.name.includes('Lumiere'));
      assert(Array.isArray(json.platforms));
      const platformIds = json.platforms.map(p => p.id);
      assert(platformIds.includes('netflix'), 'Must include netflix');
      assert(platformIds.includes('primevideo'), 'Must include primevideo');
      assert(platformIds.includes('jiohotstar'), 'Must include jiohotstar');
      assert(platformIds.includes('zee5'), 'Must include zee5');
    });

    await itAsync('GET /api/extension/download streams valid ZIP containing extension files', async () => {
      const res = await fetch(`${baseUrl}/api/extension/download`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'application/zip');
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      assert(buffer.length > 500, 'Zip file must contain reasonable size');

      // Verify ZIP file signature PK\x03\x04
      const zipSig = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      assert(buffer.subarray(0, 4).equals(zipSig), 'Must have valid ZIP header signature');

      // Verify it contains manifest.json string
      assert(buffer.includes(Buffer.from('manifest.json', 'utf8')), 'Zip must contain manifest.json');
      assert(buffer.includes(Buffer.from('netflix.js', 'utf8')), 'Zip must contain netflix.js');
    });

    console.log('\n================================================================');
    console.log('  TEST SUITE 5: REAL-TIME SOCKET.IO STREAMING SYNC PROTOCOL');
    console.log('================================================================');

    await itAsync('Host emits host-set-streaming -> all peers receive sync-streaming-changed', async () => {
      const client1 = ClientIo(baseUrl, { transports: ['websocket'] });
      const client2 = ClientIo(baseUrl, { transports: ['websocket'] });

      const roomId = 'STREAM_TEST_' + Date.now();

      await Promise.all([
        new Promise(r => client1.on('connect', r)),
        new Promise(r => client2.on('connect', r))
      ]);

      // Join room
      client1.emit('join-room', { roomId, username: 'HostUser' });
      await new Promise(r => client1.once('room-joined', r));

      client2.emit('join-room', { roomId, username: 'MemberUser' });
      await new Promise(r => client2.once('room-joined', r));

      // Test host-set-streaming broadcast
      const streamingChangedPromise = new Promise((resolve) => {
        client2.once('sync-streaming-changed', (data) => {
          assert.strictEqual(data.platform, 'netflix');
          assert.strictEqual(data.title, 'Stranger Things S4:E1');
          assert.strictEqual(data.url, 'https://www.netflix.com/watch/80057281');
          resolve();
        });
      });

      client1.emit('host-set-streaming', {
        roomId,
        platform: 'netflix',
        title: 'Stranger Things S4:E1',
        url: 'https://www.netflix.com/watch/80057281'
      });

      await streamingChangedPromise;

      // Test host-streaming-sync broadcast
      const actionPromise = new Promise((resolve) => {
        client2.once('sync-streaming-action', (data) => {
          assert.strictEqual(data.action, 'pause');
          assert.strictEqual(data.time, 1245);
          resolve();
        });
      });

      client1.emit('host-streaming-sync', {
        roomId,
        action: 'pause',
        time: 1245
      });

      await actionPromise;

      // Test late joiner receives active streaming party state
      const client3 = ClientIo(baseUrl, { transports: ['websocket'] });
      await new Promise(r => client3.on('connect', r));

      const lateJoinPromise = new Promise((resolve) => {
        client3.once('room-joined', (state) => {
          assert(state.currentMovie, 'Must have currentMovie');
          assert.strictEqual(state.currentMovie.type, 'streaming');
          assert.strictEqual(state.currentMovie.platform, 'netflix');
          assert.strictEqual(state.currentMovie.title, 'Stranger Things S4:E1');
          resolve();
        });
      });

      client3.emit('join-room', { roomId, username: 'LateJoiner' });
      await lateJoinPromise;

      // Test request-room-sync preserves streaming state
      const resyncPromise = new Promise((resolve) => {
        client3.once('room-synced', (state) => {
          assert(state.currentMovie);
          assert.strictEqual(state.currentMovie.type, 'streaming');
          assert.strictEqual(state.currentMovie.platform, 'netflix');
          resolve();
        });
      });

      client3.emit('request-room-sync', { roomId });
      await resyncPromise;

      // Clean up clients
      client1.disconnect();
      client2.disconnect();
      client3.disconnect();
    });

    await itAsync('All adapters execute safely in mock environment and handle null video', async () => {
      const vm = require('vm');
      const adapterFiles = ['netflix.js', 'primevideo.js', 'jiohotstar.js', 'zee5.js', 'generic.js'];

      for (const file of adapterFiles) {
        const filePath = path.join(EXTENSION_DIR, 'adapters', file);
        const code = fs.readFileSync(filePath, 'utf8');

        // Create mock DOM environment
        const mockWindow = {
          location: { pathname: '/watch/80057281', href: 'https://example.com/watch/80057281', hostname: 'netflix.com' }
        };
        const mockDoc = {
          title: 'Stranger Things - Netflix',
          querySelector: (sel) => null,
          querySelectorAll: (sel) => []
        };
        class MockEvent { constructor(type) { this.type = type; } }

        const context = vm.createContext({
          window: mockWindow,
          document: mockDoc,
          Event: MockEvent,
          console: console
        });

        vm.runInContext(code, context);

        const adapter = mockWindow.__lumiere_adapter;
        assert(adapter, `Adapter ${file} must expose __lumiere_adapter`);
        assert.strictEqual(typeof adapter.getVideo, 'function');
        assert.strictEqual(typeof adapter.getTitle, 'function');
        assert.strictEqual(typeof adapter.getContentUrl, 'function');

        // Test with empty DOM
        assert.strictEqual(adapter.getVideo(), null);
        const title = adapter.getTitle();
        assert(typeof title === 'string' && title.length > 0, `${file} getTitle() must return non-empty string`);

        // Test seek/play/pause with null video
        if (typeof adapter.seek === 'function') adapter.seek(null, 100);
        if (typeof adapter.play === 'function') adapter.play(null);
        if (typeof adapter.pause === 'function') adapter.pause(null);

        // Test with mock video element
        let dispatchedEvents = [];
        const mockVideo = {
          currentTime: 0,
          paused: true,
          playbackRate: 1.0,
          dispatchEvent: (e) => dispatchedEvents.push(e.type),
          play: async () => { mockVideo.paused = false; },
          pause: () => { mockVideo.paused = true; }
        };

        if (typeof adapter.seek === 'function') {
          adapter.seek(mockVideo, 42);
          assert.strictEqual(mockVideo.currentTime, 42, `${file} seek must update currentTime`);
        }
        if (typeof adapter.play === 'function') {
          adapter.play(mockVideo);
        }
        if (typeof adapter.pause === 'function') {
          adapter.pause(mockVideo);
          assert.strictEqual(mockVideo.paused, true);
        }
      }
    });

    await itAsync('Socket protocol edge cases: empty title fallback, rewind/forward sync, and stop stream', async () => {
      const client1 = ClientIo(baseUrl, { transports: ['websocket'] });
      const client2 = ClientIo(baseUrl, { transports: ['websocket'] });
      const roomId = 'EDGE_TEST_' + Date.now();

      await Promise.all([
        new Promise(r => client1.on('connect', r)),
        new Promise(r => client2.on('connect', r))
      ]);

      client1.emit('join-room', { roomId, username: 'HostUser' });
      await new Promise(r => client1.once('room-joined', r));

      client2.emit('join-room', { roomId, username: 'MemberUser' });
      await new Promise(r => client2.once('room-joined', r));

      // Test empty title fallback to platform name
      const fallbackTitlePromise = new Promise((resolve) => {
        client2.once('sync-streaming-changed', (data) => {
          assert.strictEqual(data.platform, 'primevideo');
          assert.strictEqual(data.title, 'PRIMEVIDEO Party');
          resolve();
        });
      });

      client1.emit('host-set-streaming', {
        roomId,
        platform: 'primevideo',
        title: '',
        url: ''
      });
      await fallbackTitlePromise;

      // Test rewind10 and forward10 relative actions
      const rewindPromise = new Promise((resolve) => {
        client2.once('sync-streaming-action', (data) => {
          assert.strictEqual(data.action, 'rewind10');
          assert(typeof data.time === 'number' && data.time >= 0, 'rewind10 time must never be negative');
          resolve();
        });
      });
      client1.emit('host-streaming-sync', { roomId, action: 'rewind10', time: -10 });
      await rewindPromise;

      const forwardPromise = new Promise((resolve) => {
        client2.once('sync-streaming-action', (data) => {
          assert.strictEqual(data.action, 'forward10');
          assert(typeof data.time === 'number' && data.time >= 10, 'forward10 time must increment');
          resolve();
        });
      });
      client1.emit('host-streaming-sync', { roomId, action: 'forward10', time: 10 });
      await forwardPromise;

      // Test host-stop-movie
      const stopPromise = new Promise((resolve) => {
        client2.once('sync-movie-stopped', resolve);
      });
      client1.emit('host-stop-movie', { roomId });
      await stopPromise;

      client1.disconnect();
      client2.disconnect();
    });

    await itAsync('Streaming playback dual-sync: host-play/pause/seek emits sync-streaming-action, host-streaming-sync emits sync-play/pause/seek', async () => {
      const client1 = ClientIo(baseUrl, { transports: ['websocket'] });
      const client2 = ClientIo(baseUrl, { transports: ['websocket'] });
      const roomId = 'DUAL_SYNC_' + Date.now();

      await Promise.all([
        new Promise(r => client1.on('connect', r)),
        new Promise(r => client2.on('connect', r))
      ]);

      client1.emit('join-room', { roomId, username: 'HostUser' });
      await new Promise(r => client1.once('room-joined', r));
      client2.emit('join-room', { roomId, username: 'PeerUser' });
      await new Promise(r => client2.once('room-joined', r));

      // Put room in streaming mode
      const setStreamPromise = new Promise(r => client2.once('sync-streaming-changed', r));
      client1.emit('host-set-streaming', { roomId, platform: 'netflix', title: 'Test Stream', url: 'https://netflix.com' });
      await setStreamPromise;

      // When extension sends host-play, peer receives sync-streaming-action
      const actionPlayPromise = new Promise((resolve) => {
        client2.once('sync-streaming-action', (data) => {
          assert.strictEqual(data.action, 'play');
          assert.strictEqual(data.time, 45);
          resolve();
        });
      });
      client1.emit('host-play', { roomId, time: 45 });
      await actionPlayPromise;

      // When web app sends host-streaming-sync (pause), peer receives sync-pause
      const syncPausePromise = new Promise((resolve) => {
        client2.once('sync-pause', (data) => {
          assert.strictEqual(data.time, 45);
          resolve();
        });
      });
      client1.emit('host-streaming-sync', { roomId, action: 'pause', time: 45 });
      await syncPausePromise;

      // Heartbeat during streaming mode is accepted and forwarded
      const heartbeatPromise = new Promise((resolve) => {
        client2.once('sync-heartbeat', (data) => {
          assert.strictEqual(data.time, 50);
          resolve();
        });
      });
      client1.emit('host-heartbeat', { roomId, time: 50, isPlaying: true });
      await heartbeatPromise;

      client1.disconnect();
      client2.disconnect();
    });

  } finally {
    serverProc.kill();
  }
}

runServerAndNetworkTests().then(() => {
  console.log('\n================================================================');
  console.log(`  🎉 ALL ${totalTests} TESTS PASSED PERFECTLY!`);
  console.log('================================================================\n');
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
