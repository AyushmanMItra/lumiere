/**
 * Test Suite: Screen Resize & Reposition Feature and Playback Speed Icon
 * Verifies DOM elements, CSS classes, speed icon vector replacement, and JavaScript handlers.
 */

const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('  TEST SUITE: SCREEN RESIZE & REPOSITION FEATURE');
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

// 1. Playback Speed Selector Icon
test('Speed picker group has SVG element instead of flash emoji', () => {
  const speedGroup = html.substring(html.indexOf('id="speedPickerGroup"'), html.indexOf('id="speedPickerGroup"') + 600);
  assert(!speedGroup.includes('⚡'), 'Speed picker must not contain flash emoji');
  assert(speedGroup.includes('<svg class="hud-pill-icon"'), 'Speed picker must contain vector SVG icon');
});

test('Zero occurrences of flash emoji in public/index.html', () => {
  assert(!html.includes('⚡'), 'index.html must not contain flash emoji');
});

// 2. DOM Elements for Screen Transform Feature
test('index.html contains videoHoldIndicator with circular progress ring', () => {
  assert(html.includes('id="videoHoldIndicator"'), 'videoHoldIndicator must exist');
  assert(html.includes('id="holdRingProgress"'), 'holdRingProgress must exist');
});

test('index.html contains videoTransformGuide framing overlay', () => {
  assert(html.includes('id="videoTransformGuide"'), 'videoTransformGuide overlay must exist');
  assert(html.includes('transform-corner top-left'), 'Corner brackets must exist');
});

test('index.html contains videoTransformHUD with scale slider and +/- buttons', () => {
  assert(html.includes('id="videoTransformHUD"'), 'videoTransformHUD dialog must exist');
  assert(html.includes('id="videoScaleSlider"'), 'videoScaleSlider must exist');
  assert(html.includes('id="scaleMinusBtn"'), 'scaleMinusBtn must exist');
  assert(html.includes('id="scalePlusBtn"'), 'scalePlusBtn must exist');
  assert(html.includes('id="transformScaleBadge"'), 'transformScaleBadge must exist');
});

test('index.html contains fit presets (Fit, Cover, Stretch, 1.25x)', () => {
  assert(html.includes('id="transformFitPresets"'), 'transformFitPresets must exist');
  assert(html.includes('data-fit="contain"'), 'contain preset must exist');
  assert(html.includes('data-fit="cover"'), 'cover preset must exist');
  assert(html.includes('data-fit="fill"'), 'fill preset must exist');
  assert(html.includes('data-fit="zoom125"'), 'zoom125 preset must exist');
});

test('index.html contains directional D-pad nudge buttons and center snap', () => {
  assert(html.includes('id="nudgeUpBtn"'), 'nudgeUpBtn must exist');
  assert(html.includes('id="nudgeDownBtn"'), 'nudgeDownBtn must exist');
  assert(html.includes('id="nudgeLeftBtn"'), 'nudgeLeftBtn must exist');
  assert(html.includes('id="nudgeRightBtn"'), 'nudgeRightBtn must exist');
  assert(html.includes('id="centerTransformBtn"'), 'centerTransformBtn must exist');
  assert(html.includes('id="transformOffsetBadge"'), 'transformOffsetBadge must exist');
});

test('index.html contains reset and done action buttons', () => {
  assert(html.includes('id="resetTransformBtn"'), 'resetTransformBtn must exist');
  assert(html.includes('id="doneTransformBtn"'), 'doneTransformBtn must exist');
  assert(html.includes('id="closeTransformHudBtn"'), 'closeTransformHudBtn must exist');
});

test('moreOptionsMenu contains menuTransformBtn secondary trigger', () => {
  assert(html.includes('id="menuTransformBtn"'), 'menuTransformBtn must exist in moreOptionsMenu');
});

// 3. CSS Classes & Styles
test('style.css defines styling for hold indicator, guide, and transform HUD', () => {
  assert(css.includes('.video-hold-indicator'), 'CSS for video-hold-indicator must exist');
  assert(css.includes('.video-transform-hud'), 'CSS for video-transform-hud must exist');
  assert(css.includes('.video-transform-guide'), 'CSS for video-transform-guide must exist');
  assert(css.includes('.cinema-box.is-transforming'), 'CSS for is-transforming must exist');
  assert(css.includes('.cinema-box.is-transforming.is-dragging'), 'CSS for is-dragging must exist');
});

// 4. JS Application Logic & Handlers
test('app.js declares screenTransformState and initVideoTransformFeature', () => {
  assert(app.includes('const screenTransformState = {'), 'screenTransformState must be declared');
  assert(app.includes('function initVideoTransformFeature()'), 'initVideoTransformFeature must be defined');
  assert(app.includes('initVideoTransformFeature();'), 'initVideoTransformFeature must be called in init()');
});

test('app.js implements press-and-hold (450ms) and disambiguates taps/clicks', () => {
  assert(app.includes('HOLD_MS = 450'), 'Hold duration must be 450ms');
  assert(app.includes('screenTransformState.suppressTap'), 'suppressTap flag must guard clicks/taps');
  assert(app.includes('screenTransformState.isTransforming'), 'isTransforming must guard cinemaBox interactions');
});

test('app.js implements direct dragging, pinch-to-zoom, and mouse wheel zoom', () => {
  assert(app.includes('isDragging = true;'), 'Direct drag must be implemented');
  assert(app.includes('initialPinchDist'), 'Pinch-to-zoom must be supported');
  assert(app.includes('deltaY < 0 ? 0.05 : -0.05'), 'Wheel zoom must be supported');
});

test('app.js persists transform settings to localStorage and restores them', () => {
  assert(app.includes('lumiere_screen_transform'), 'localStorage key must be used');
  assert(app.includes('function saveScreenTransform()'), 'saveScreenTransform must be implemented');
  assert(app.includes('function loadSavedScreenTransform()'), 'loadSavedScreenTransform must be implemented');
});

console.log('================================================================');
console.log(`  RESULTS: ${passed}/${total} passed`);
console.log('================================================================');

if (passed !== total) {
  process.exit(1);
}
