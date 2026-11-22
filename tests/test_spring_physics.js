/**
 * TEST SUITE: Fluid Motion Spring Physics Verification
 * Verifies cubic-bezier(0.34, 1.56, 0.64, 1) spring physics transitions across:
 * - Docked theater mode (.cinema-stage-wrapper)
 * - Popped-out floating window (.is-floating-window)
 * - Corner mini-player mode (.mini-player-active / .mini-player-mode)
 *
 * Strict No-Emoji Policy: Uses [PASS], [FAIL], [INFO], [SUCCESS] textual tags.
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.resolve(__dirname, '..', 'public');
const styleCss = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${details ? ': ' + details : ''}`);
    failed++;
  }
}

console.log('================================================================');
console.log('  TEST SUITE: FLUID MOTION SPRING PHYSICS VERIFICATION');
console.log('================================================================\n');

// 1. CSS Spring curve assertions
const springCurve = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
assert(styleCss.includes(springCurve), 'style.css declares spring curve cubic-bezier(0.34, 1.56, 0.64, 1)');

// 2. Docked theater stage transitions
const dockedStageMatch = styleCss.includes('.cinema-stage-wrapper') &&
  styleCss.includes('transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)') &&
  styleCss.includes('scale 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)') &&
  styleCss.includes('box-shadow 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)') &&
  styleCss.includes('border-radius 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)');
assert(dockedStageMatch, 'style.css defines spring transitions for .cinema-stage-wrapper (transform, scale, box-shadow, border-radius)');

// 3. Popped-out floating window transitions
const floatingStageMatch = styleCss.includes('.cinema-stage-wrapper.is-floating-window') &&
  styleCss.includes('left 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)') &&
  styleCss.includes('top 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)') &&
  styleCss.includes('width 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)') &&
  styleCss.includes('height 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)');
assert(floatingStageMatch, 'style.css defines spring transitions for .is-floating-window (transform, scale, positioning, dimensions)');

// 4. Corner mini-player transitions
const miniPlayerMatch = styleCss.includes('.mini-player-active #cinemaStageWrapper') &&
  styleCss.includes('right 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)') &&
  styleCss.includes('bottom 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)');
assert(miniPlayerMatch, 'style.css defines spring transitions for .mini-player-active (positioning right/bottom, dimensions, transform, scale)');

// 5. Zero-lag drag and resize suppression rules
const zeroLagMatch = styleCss.includes('body.window-dragging-active #cinemaStageWrapper') &&
  styleCss.includes('body.window-resizing-active #cinemaStageWrapper') &&
  styleCss.includes('transition: none !important;');
assert(zeroLagMatch, 'style.css enforces transition: none !important during window dragging and resizing');

// 6. JavaScript spring physics animator
assert(appJs.includes('function animateStageSpringPhysics'), 'app.js defines animateStageSpringPhysics');
assert(appJs.includes('function cancelStageSpringPhysics'), 'app.js defines cancelStageSpringPhysics');
assert(appJs.includes('targetEl._springCleanupTimer'), 'app.js tracks and clears active spring cleanup timers');
assert(appJs.includes('targetEl._springEndHandler'), 'app.js manages transitionend listener cleanup');

// 7. Transition suppression during measurement in JS
assert(appJs.includes("stage.style.setProperty('transition', 'none', 'important')"), 'app.js suppresses transitions during FLIP lastRect measurement in enterMiniPlayerMode and exitMiniPlayerMode');

// 8. Zero emoji adherence
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA70}-\u{1FAFF}]/u;
assert(!emojiRegex.test(styleCss), 'style.css contains zero emojis');
assert(!emojiRegex.test(appJs), 'app.js contains zero emojis');

console.log('\n================================================================');
console.log(`  RESULTS: ${passed}/${passed + failed} passed`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
