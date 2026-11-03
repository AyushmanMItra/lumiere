/**
 * Test Suite: Windows-Style Resizable & Repositionable Windows
 * Verifies movie screen & webcam video tile window management, title bars, 8-way resize handles, and speed icon.
 */

const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('  TEST SUITE: WINDOWS-STYLE RESIZE & REPOSITION (WINDOW MANAGER)');
console.log('================================================================');

const html = fs.readFileSync('public/index.html', 'utf8');
const css = fs.readFileSync('public/style.css', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');

let total = 0;
let passed = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

// 1. Playback Speed Selector Vector Icon
test('Speed picker group has SVG element instead of flash emoji', () => {
  const speedGroup = html.substring(html.indexOf('id="speedPickerGroup"'), html.indexOf('id="speedPickerGroup"') + 600);
  assert(!speedGroup.includes('⚡'), 'Speed picker must not contain flash emoji');
  assert(speedGroup.includes('<svg class="hud-pill-icon"'), 'Speed picker must contain vector SVG icon');
});

test('Zero occurrences of flash emoji in public/index.html', () => {
  assert(!html.includes('⚡'), 'index.html must not contain flash emoji');
});

// 2. Movie Screen Window & Title Bar
test('index.html contains movieWindowTitleBar with title, size badge, reset, and dock buttons', () => {
  assert(html.includes('id="movieWindowTitleBar"'), 'movieWindowTitleBar must exist');
  assert(html.includes('id="movieWindowSizeBadge"'), 'movieWindowSizeBadge must exist');
  assert(html.includes('id="movieWindowResetBtn"'), 'movieWindowResetBtn must exist');
  assert(html.includes('id="movieWindowDockBtn"'), 'movieWindowDockBtn must exist');
});

test('index.html contains 8 Windows-style resize handles on cinema stage wrapper', () => {
  assert(html.includes('class="window-resize-handle handle-n"'), 'handle-n must exist');
  assert(html.includes('class="window-resize-handle handle-s"'), 'handle-s must exist');
  assert(html.includes('class="window-resize-handle handle-e"'), 'handle-e must exist');
  assert(html.includes('class="window-resize-handle handle-w"'), 'handle-w must exist');
  assert(html.includes('class="window-resize-handle handle-ne"'), 'handle-ne must exist');
  assert(html.includes('class="window-resize-handle handle-nw"'), 'handle-nw must exist');
  assert(html.includes('class="window-resize-handle handle-se"'), 'handle-se must exist');
  assert(html.includes('class="window-resize-handle handle-sw"'), 'handle-sw must exist');
});

test('index.html contains videoHoldIndicator for press-and-hold trigger', () => {
  assert(html.includes('id="videoHoldIndicator"'), 'videoHoldIndicator must exist');
  assert(html.includes('id="holdRingProgress"'), 'holdRingProgress must exist');
});

test('moreOptionsMenu contains menuTransformBtn window pop-out toggle', () => {
  assert(html.includes('id="menuTransformBtn"'), 'menuTransformBtn must exist in moreOptionsMenu');
  assert(html.includes('id="menuTransformTitle"'), 'menuTransformTitle must exist in moreOptionsMenu');
});

// 3. CSS Window Styles
test('style.css defines floating window styles for movie screen and webcam tiles', () => {
  assert(css.includes('.cinema-stage-wrapper.is-floating-window'), 'cinema-stage-wrapper floating styles must exist');
  assert(css.includes('.participant-tile.is-floating-window'), 'participant-tile floating styles must exist');
  assert(css.includes('.window-title-bar'), 'window-title-bar styles must exist');
  assert(css.includes('.window-resize-handle'), 'window-resize-handle styles must exist');
  assert(css.includes('.window-dock-btn'), 'window-dock-btn styles must exist');
  assert(css.includes('.participant-tile-placeholder'), 'participant-tile-placeholder styles must exist');
});

test('style.css defines correct cursor resize directions for 8 handles', () => {
  assert(css.includes('cursor: ns-resize'), 'ns-resize cursor must exist');
  assert(css.includes('cursor: ew-resize'), 'ew-resize cursor must exist');
  assert(css.includes('cursor: nwse-resize'), 'nwse-resize cursor must exist');
  assert(css.includes('cursor: nesw-resize'), 'nesw-resize cursor must exist');
});

// 4. JS Application Logic & Handlers
test('app.js declares windowManager and initWindowManagement', () => {
  assert(app.includes('const windowManager = {'), 'windowManager must be declared');
  assert(app.includes('function initWindowManagement()'), 'initWindowManagement must be defined');
  assert(app.includes('initWindowManagement();'), 'initWindowManagement must be called in init()');
});

test('app.js implements popOutMovieWindow and dockMovieWindow', () => {
  assert(app.includes('function popOutMovieWindow('), 'popOutMovieWindow must be defined');
  assert(app.includes('function dockMovieWindow()'), 'dockMovieWindow must be defined');
});

test('app.js implements popOutParticipantWindow and dockParticipantWindow for webcams', () => {
  assert(app.includes('function popOutParticipantWindow('), 'popOutParticipantWindow must be defined');
  assert(app.includes('function dockParticipantWindow('), 'dockParticipantWindow must be defined');
});

test('app.js implements title bar drag (handleDragStart) and 8-way resize (handleResizeStart)', () => {
  assert(app.includes('function handleDragStart('), 'handleDragStart must be defined');
  assert(app.includes('function handleResizeStart('), 'handleResizeStart must be defined');
});

test('app.js attaches title bar and 8 resize handles to each participant tile', () => {
  assert(app.includes('participant-window-title-bar'), 'participant title bar must be constructed');
  assert(app.includes('setupParticipantWindowHandlers(tile);'), 'setupParticipantWindowHandlers must be called');
});

test('app.js implements 450ms click-and-hold trigger and click suppression', () => {
  assert(app.includes('windowManager.suppressClick = true;'), 'Click suppression must be implemented');
  assert(app.includes('windowManager.suppressClick'), 'suppressClick must guard moviePlayer clicks');
});

// 5. Reparenting, 1:1 Cursor Lock & Boundary Clamping
test('app.js reparents floating windows to document.body and restores on dock', () => {
  assert(app.includes('document.body.appendChild(stage);'), 'popOutMovieWindow must reparent stage to document.body');
  assert(app.includes('movieStagePlaceholder'), 'movieStagePlaceholder must be created and inserted');
  assert(app.includes('placeholder.parentNode.insertBefore(stage, placeholder);'), 'dockMovieWindow must restore stage before placeholder');
});

test('app.js implements 1:1 cursor locking via grabOffset and viewport boundary clamping', () => {
  assert(app.includes('grabOffsetX = startPointerX - rect.left'), 'handleDragStart must calculate grabOffsetX');
  assert(app.includes('grabOffsetY = startPointerY - rect.top'), 'handleDragStart must calculate grabOffsetY');
  assert(app.includes('desiredLeft = curX - grabOffsetX'), 'onMove must maintain 1:1 cursor anchor');
  assert(app.includes('boundedLeft = Math.max(minLeft'), 'onMove must clamp left within viewport');
  assert(app.includes('boundedTop = Math.max(minTop'), 'onMove must clamp top within viewport');
});

test('app.js clamps saved window layout on load and handles viewport resize', () => {
  assert(app.includes('window.addEventListener(\'resize\''), 'Window resize listener must be attached');
  assert(app.includes('loadSavedMovieWindowLayout'), 'loadSavedMovieWindowLayout must validate bounds');
});

test('style.css defines cinema-stage-placeholder and zero-transition drag locking', () => {
  assert(css.includes('.cinema-stage-placeholder'), 'cinema-stage-placeholder styles must exist');
  assert(css.includes('.placeholder-dock-btn'), 'placeholder-dock-btn styles must exist');
  assert(css.includes('.cinema-stage-wrapper.is-floating-window'), 'floating window styles must exist');
  assert(css.includes('transition: none !important;'), 'floating window must disable transitions for zero lag');
});

console.log('================================================================');
console.log(`  RESULTS: ${passed}/${total} passed`);
console.log('================================================================');

if (passed !== total) {
  process.exit(1);
}
