/**
 * TEST SUITE: Plan A, Plan B & Universal Mobile/Tablet Responsive Optimization
 * 
 * Verifies:
 * - Plan A: Participant quick controls, volume slider (0-200%), connection quality badges, invite tile
 * - Plan B: Timeline hover remaining time tooltip, double-tap seek ripples, cinema focus mode
 * - Mobile & Tablet Responsive Optimization: Zero-overlap rules, dynamic viewport scaling, safe areas
 * - Zero-Emoji Policy Adherence
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const targetDir = process.env.TARGET_DIR || 'public';
const baseDir = path.resolve(__dirname, '..', targetDir);

console.log('================================================================');
console.log('  TEST SUITE: PLAN A, PLAN B & MOBILE/TABLET OPTIMIZATION');
console.log('  Target Directory:', baseDir);
console.log('================================================================\n');

const htmlPath = path.join(baseDir, 'index.html');
const cssPath = path.join(baseDir, 'style.css');
const jsPath = path.join(baseDir, 'app.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const app = fs.readFileSync(jsPath, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failed++;
  }
}

function suite(name) {
  console.log(`----------------------------------------------------------------`);
  console.log(`  SUITE: ${name}`);
  console.log(`----------------------------------------------------------------`);
}

// ============================================================================
// SUITE 1: Plan A - Participant Controls, Quality Badges & Invite Tile
// ============================================================================
suite('Plan A - Participant Experience & Audio Controls');

test('app.js defines setParticipantVolume supporting 0-200% scaling', () => {
  assert(app.includes('function setParticipantVolume'), 'app.js must declare setParticipantVolume');
  assert(app.includes('state.participantVolumes.set'), 'setParticipantVolume must update state');
  assert(app.includes('max="200"') || app.includes("max', '200'"), 'Volume slider must support up to 200%');
});

test('app.js integrates Web Audio GainNode for volume amplification > 100%', () => {
  assert(app.includes('createGain') || app.includes('gainNode'), 'app.js must support Web Audio GainNode');
  assert(app.includes('gain.value'), 'Gain value must be assigned for amplification');
});

test('app.js renders .tile-network-badge with signal bars on participant tiles', () => {
  assert(app.includes('tile-network-badge'), 'app.js must render .tile-network-badge element');
  assert(app.includes('net-bar'), 'Badge must render signal bars');
  assert(app.includes('net-latency-text'), 'Badge must render latency text');
});

test('style.css defines .tile-network-badge styles with good, fair, and poor states', () => {
  assert(css.includes('.tile-network-badge'), 'style.css must define .tile-network-badge');
  assert(css.includes('.net-good'), 'style.css must define .net-good state');
  assert(css.includes('.net-fair'), 'style.css must define .net-fair state');
  assert(css.includes('.net-poor'), 'style.css must define .net-poor state');
});

test('app.js implements startNetworkQualityMonitor querying WebRTC peer stats', () => {
  assert(app.includes('function startNetworkQualityMonitor'), 'app.js must define startNetworkQualityMonitor');
  assert(app.includes('getStats()'), 'startNetworkQualityMonitor must query peer connection stats');
});

test('app.js and style.css implement .participant-quick-menu with spotlight and mute', () => {
  assert(app.includes('participant-quick-menu'), 'app.js must create .participant-quick-menu');
  assert(app.includes('quick-spot-btn'), 'app.js must provide spotlight button');
  assert(app.includes('quick-mute-btn'), 'app.js must provide quick mute button');
  assert(css.includes('.participant-quick-menu'), 'style.css must style .participant-quick-menu');
  assert(css.includes('.participant-tile.is-spotlighted'), 'style.css must define spotlighted tile styling');
});

test('participant strip does not inject placeholder invite tiles', () => {
  assert(!app.includes('createInviteTile'), 'app.js must not create synthetic invite cards in participant strip');
  assert(!css.includes('.participant-tile-invite'), 'style.css must not style .participant-tile-invite');
});

test('index.html and app.js maintain dedicated corner/dock invite button', () => {
  assert(html.includes('id="dockInviteBtn"'), 'index.html must maintain #dockInviteBtn');
  assert(app.includes('dockInviteBtn'), 'app.js must handle #dockInviteBtn click');
  assert(app.includes('copyInviteLink') || app.includes('copyLink'), 'app.js must copy invite link');
});

// ============================================================================
// SUITE 2: Plan B - Timeline Tooltip, Double-Tap Seek & Cinema Focus Dimming
// ============================================================================
suite('Plan B - Cinema Scrubbing & Immersion');

test('index.html contains timeline hover tooltip with hover and remaining time', () => {
  assert(html.includes('id="timelineHoverTime"'), 'index.html must contain #timelineHoverTime');
  assert(html.includes('hover-time-text') || html.includes('hoverTimeText'), 'Must have hover time container');
  assert(html.includes('hover-time-rem') || html.includes('hoverRemainingText'), 'Must have remaining time container');
});

test('style.css styles .hud-hover-tooltip with glassmorphism and arrow pointer', () => {
  assert(css.includes('.hud-hover-tooltip'), 'style.css must define .hud-hover-tooltip');
  assert(css.includes('.hover-time-rem'), 'style.css must style remaining time text');
});

test('app.js computes remaining time and clamps timeline tooltip position', () => {
  assert(app.includes('updateTimelineTooltip'), 'app.js must declare updateTimelineTooltip');
  assert(app.includes('hoverRemainingText'), 'app.js must update hover remaining time');
  assert(app.includes('Math.min') && app.includes('Math.max'), 'app.js must clamp tooltip position');
});

test('index.html defines double-tap seek ripple overlay (#doubleTapSeekOverlay)', () => {
  assert(html.includes('id="doubleTapSeekOverlay"'), 'index.html must include #doubleTapSeekOverlay');
  assert(html.includes('id="seekRippleLeft"'), 'index.html must include #seekRippleLeft');
  assert(html.includes('id="seekRippleRight"'), 'index.html must include #seekRippleRight');
});

test('style.css defines seek ripple circular animations and keyframes', () => {
  assert(css.includes('.double-tap-seek-overlay'), 'style.css must style .double-tap-seek-overlay');
  assert(css.includes('.seek-ripple-container'), 'style.css must style .seek-ripple-container');
  assert(css.includes('seekRipplePulse'), 'style.css must define seekRipplePulse keyframe animation');
});

test('app.js implements initDoubleTapSeeking detecting 2-tap gesture on left/right screen zones', () => {
  assert(app.includes('function initDoubleTapSeeking'), 'app.js must declare initDoubleTapSeeking');
  assert(app.includes('seekRelative(-10)'), 'Must seek -10s on left double tap');
  assert(app.includes('seekRelative(10)'), 'Must seek +10s on right double tap');
});

test('app.js and style.css implement .cinema-focus-mode dimming peripheral UI on play', () => {
  assert(app.includes('function initCinemaFocusMode'), 'app.js must declare initCinemaFocusMode');
  assert(app.includes('cinema-focus-mode'), 'app.js must toggle cinema-focus-mode class');
  assert(css.includes('.cinema-focus-mode #topBar'), 'style.css must dim top bar in focus mode');
  assert(css.includes('.cinema-focus-mode .floating-pill-dock'), 'style.css must dim dock in focus mode');
  assert(css.includes('.cinema-focus-mode .participants-tile-area'), 'style.css must dim participants in focus mode');
});

// ============================================================================
// SUITE 3: Universal Mobile & Tablet Responsive Optimization (Zero Overlap)
// ============================================================================
suite('Universal Mobile & Tablet Zero-Overlap Optimization');

test('style.css implements dynamic viewport height (100dvh)', () => {
  assert(css.includes('100dvh'), 'style.css must utilize 100dvh for mobile address bar stability');
});

test('style.css enforces bottom dock padding preventing overlap on mobile portrait', () => {
  const hasPortraitDockSafety = css.includes('padding-bottom: 84px') || 
                                css.includes('padding-bottom: 76px') ||
                                css.includes('padding-bottom: 80px');
  assert(hasPortraitDockSafety, 'style.css must enforce bottom padding on participants area in portrait');
});

test('style.css enforces dock width containment and safe-area inset on small screens', () => {
  assert(css.includes('calc(100vw - 20px)'), 'Dock width must be clamped on mobile');
  assert(css.includes('safe-area-inset-bottom'), 'Dock must respect safe-area-inset-bottom');
});

test('style.css defines mobile landscape optimizations for short viewports (max-height: 600px)', () => {
  const hasLandscapeRules = css.includes('(max-height: 600px)') && 
                            css.includes('calc(100dvh - 96px)');
  assert(hasLandscapeRules, 'style.css must enforce stage height limits on short landscape displays');
});

test('style.css scales participant tiles and quick action buttons on mobile landscape', () => {
  const hasCompactTiles = css.includes('width: 180px') && css.includes('height: 98px');
  assert(hasCompactTiles, 'style.css must scale participant tiles on short landscape viewports');
});

test('style.css defines tablet scaling across 768px-1024px viewports', () => {
  assert(css.includes('min-width: 768px') && css.includes('max-width: 1024px'), 'style.css must define tablet range');
});

// ============================================================================
// SUITE 4: Strict Zero-Emoji Compliance
// ============================================================================
suite('Strict Zero-Emoji Policy Adherence');

const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

test('index.html contains zero emojis across all nodes', () => {
  const match = html.match(emojiRegex);
  assert(!match, `Emoji found in index.html: ${match ? match[0] : ''}`);
});

test('style.css contains zero emojis', () => {
  const match = css.match(emojiRegex);
  assert(!match, `Emoji found in style.css: ${match ? match[0] : ''}`);
});

test('app.js contains zero emojis', () => {
  const match = app.match(emojiRegex);
  assert(!match, `Emoji found in app.js: ${match ? match[0] : ''}`);
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n================================================================');
console.log('  TEST SUMMARY: PLAN A, PLAN B & MOBILE OPTIMIZATION');
console.log(`  Target Directory: ${baseDir}`);
console.log(`  Total Checks:     ${passed + failed}`);
console.log(`  Passed:           ${passed}`);
console.log(`  Failed:           ${failed}`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('[SUCCESS] All Plan A, Plan B & Mobile Optimization tests passed perfectly!\n');
  process.exit(0);
}
