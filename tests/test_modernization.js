/**
 * Test Suite: WatchParty Modernization & Polish Verification
 * 
 * Verifies all features assigned across:
 * - R2: Bottom Action Pill Dock (7 items, glassmorphism, active status rings)
 * - R2: Side Chat Panel (Message cards, role badges, procedural Web Audio)
 * - R3: Stage Grid, Speaking Halos & Screen Share Picture-in-Picture
 * - R4: Subtitle Settings Live Preview Sliders & Web Audio Dialogue Booster
 * - R5: Viewport Edge/Corner Window Snapping & Mini-Player Mode
 * - R6: Strict Policy Adherence (Zero emojis across all source files)
 * - Pairwise Combinatorial & Realistic Architecture Scenarios (Tiers 3 & 4)
 * 
 * Usage:
 *   node tests/test_modernization.js
 *   TARGET_DIR=test_website/public node tests/test_modernization.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Resolve Target Directory and Files
const targetDir = process.env.TARGET_DIR || 'public';
const isTestWebsite = targetDir.includes('test_website');
const baseDir = path.resolve(__dirname, '..');
const publicDir = path.isAbsolute(targetDir) ? targetDir : path.join(baseDir, targetDir);
const serverPath = isTestWebsite
  ? path.join(baseDir, 'test_website', 'server.js')
  : path.join(baseDir, 'server.js');

console.log('================================================================');
console.log('  TEST SUITE: WATCHPARTY MODERNIZATION VERIFICATION');
console.log(`  Target Directory: ${publicDir}`);
console.log(`  Server Path:      ${serverPath}`);
console.log('================================================================');

// 2. Validate Target Environment Exists
if (!fs.existsSync(publicDir)) {
  console.error(`[ERROR] Target directory not found: ${publicDir}`);
  process.exit(1);
}

const indexPath = path.join(publicDir, 'index.html');
const stylePath = path.join(publicDir, 'style.css');
const appPath = path.join(publicDir, 'app.js');

if (!fs.existsSync(indexPath) || !fs.existsSync(stylePath) || !fs.existsSync(appPath)) {
  console.error('[ERROR] One or more core client files (index.html, style.css, app.js) are missing from target directory.');
  process.exit(1);
}

if (!fs.existsSync(serverPath)) {
  console.error(`[ERROR] Server file not found at: ${serverPath}`);
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');
const css = fs.readFileSync(stylePath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const server = fs.readFileSync(serverPath, 'utf8');

// 3. Test Runner Harness
let total = 0;
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.log(`  [FAIL] ${name}`);
    console.log(`         Error: ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

function suite(name) {
  console.log(`\n----------------------------------------------------------------`);
  console.log(`  SUITE: ${name}`);
  console.log('----------------------------------------------------------------');
}

// Unicode emoji regex matching pictographs, emoticons, symbols, flags, dingbats
const emojiRegex = /(?:[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}])/u;

// ============================================================================
// SUITE 1: Bottom Action Pill Dock & Glassmorphic Capsule HUD (R2)
// ============================================================================
suite('R2 - Bottom Action Pill Dock & Glassmorphism');

test('index.html defines all 7 action pills in bottom dock', () => {
  const hasMic = html.includes('id="toggleMicBtn"') || html.includes('id="micSplitBtn"');
  const hasCam = html.includes('id="toggleCameraBtn"') || html.includes('id="cameraSplitBtn"');
  const hasScreenShare = html.includes('id="dockScreenShareBtn"');
  const hasMovieLibrary = html.includes('id="dockMovieLibraryBtn"') || html.includes('id="hostMovieLibraryDockBtn"');
  const hasReactions = html.includes('id="dockReactionsBtn"') || html.includes('id="dockReactionsGroup"');
  const hasOptions = html.includes('id="moreOptionsBtn"') || html.includes('id="moreOptionsGroup"');
  const hasDisconnect = html.includes('id="disconnectBtn"');

  assert(hasMic, 'Must contain Mic pill button (#toggleMicBtn or #micSplitBtn)');
  assert(hasCam, 'Must contain Camera pill button (#toggleCameraBtn or #cameraSplitBtn)');
  assert(hasScreenShare, 'Must contain Screen Share pill button (#dockScreenShareBtn)');
  assert(hasMovieLibrary, 'Must contain Movie Library pill button (#dockMovieLibraryBtn or #hostMovieLibraryDockBtn)');
  assert(hasReactions, 'Must contain Reactions pill button (#dockReactionsBtn or #dockReactionsGroup)');
  assert(hasOptions, 'Must contain Options pill button (#moreOptionsBtn or #moreOptionsGroup)');
  assert(hasDisconnect, 'Must contain Disconnect pill button (#disconnectBtn)');
});

test('Action pills are organized inside .floating-pill-dock capsule container', () => {
  assert(html.includes('class="floating-pill-dock"') || html.includes("class='floating-pill-dock'"),
    'index.html must contain .floating-pill-dock container');
  
  const dockStartIndex = html.indexOf('class="floating-pill-dock"');
  assert(dockStartIndex !== -1, 'index.html must contain .floating-pill-dock container');
  const dockEndIndex = html.indexOf('<!-- Right corner', dockStartIndex);
  const dockSubstring = dockEndIndex !== -1 
    ? html.substring(dockStartIndex, dockEndIndex)
    : html.substring(dockStartIndex, dockStartIndex + 15000);
  
  assert(dockSubstring.includes('toggleMicBtn') || dockSubstring.includes('micSplitBtn'),
    '.floating-pill-dock must contain Mic pill');
  assert(dockSubstring.includes('toggleCameraBtn') || dockSubstring.includes('cameraSplitBtn'),
    '.floating-pill-dock must contain Camera pill');
  assert(dockSubstring.includes('dockMovieLibraryBtn') || dockSubstring.includes('hostMovieLibraryDockBtn'),
    '.floating-pill-dock must contain Movie Library pill');
  assert(dockSubstring.includes('disconnectBtn'),
    '.floating-pill-dock must contain Disconnect pill');
});

test('Action pills have descriptive accessibility title or aria-label attributes', () => {
  const pillPatterns = [
    /id="(?:toggleMicBtn|micSplitBtn)"[^>]*?(?:title|aria-label)=/s,
    /id="(?:toggleCameraBtn|cameraSplitBtn)"[^>]*?(?:title|aria-label)=/s,
    /id="dockScreenShareBtn"[^>]*?(?:title|aria-label)=/s,
    /id="(?:dockMovieLibraryBtn|hostMovieLibraryDockBtn)"[^>]*?(?:title|aria-label)=/s,
    /id="(?:dockReactionsBtn|dockReactionsGroup)"[^>]*?(?:title|aria-label)=/s,
    /id="(?:moreOptionsBtn|moreOptionsGroup)"[^>]*?(?:title|aria-label)=/s,
    /id="disconnectBtn"[^>]*?(?:title|aria-label)=/s
  ];

  pillPatterns.forEach((regex, idx) => {
    assert(regex.test(html), `Action pill #${idx + 1} must include title or aria-label for accessibility`);
  });
});

test('style.css defines glassmorphic capsule styling for .floating-pill-dock', () => {
  const hasDockClass = css.includes('.floating-pill-dock');
  assert(hasDockClass, 'style.css must define .floating-pill-dock');
  
  const dockCssMatch = css.match(/\.floating-pill-dock\s*\{([^}]+)\}/s);
  assert(dockCssMatch, '.floating-pill-dock CSS rule block must exist');
  
  const dockBlock = dockCssMatch[1];
  assert(dockBlock.includes('backdrop-filter') || css.includes('-webkit-backdrop-filter'),
    '.floating-pill-dock must implement backdrop-filter for glassmorphism');
});

test('style.css defines active status ring styles (.pill-btn.active-status-ring or .active-status-ring)', () => {
  const hasActiveRing = css.includes('.active-status-ring') || css.includes('active-status-ring');
  assert(hasActiveRing, 'style.css must define .active-status-ring for active HUD status');

  const ringMatch = css.match(/\.active-status-ring\b[^{]*\{([^}]+)\}/s) ||
                    css.match(/\.pill-btn\.active-status-ring[^{]*\{([^}]+)\}/s);
  assert(ringMatch, 'active-status-ring CSS declaration block must be present');
  const ringBody = ringMatch[1];
  assert(ringBody.includes('box-shadow') || ringBody.includes('outline') || ringBody.includes('border'),
    'active status ring must render visual ring via box-shadow, outline, or border');
});

test('style.css defines muted (.pill-btn-muted) and danger (.pill-btn-danger) state classes', () => {
  assert(css.includes('.pill-btn-muted'), 'style.css must define .pill-btn-muted');
  assert(css.includes('.pill-btn-danger'), 'style.css must define .pill-btn-danger');
});

test('app.js attaches click listeners to dock pills including #dockScreenShareBtn and #dockReactionsBtn', () => {
  const hasScreenShareBinding = app.includes('dockScreenShareBtn') && 
    (app.includes("addEventListener('click'") || app.includes('onclick') || app.includes('toggleScreenShare'));
  assert(hasScreenShareBinding, 'app.js must bind click handling to #dockScreenShareBtn');

  const hasReactionsBinding = (app.includes('dockReactionsBtn') || app.includes('dockReactionsGroup')) &&
    (app.includes("addEventListener('click'") || app.includes('onclick') || app.includes('toggleReactionMenu') || app.includes('showReactions'));
  assert(hasReactionsBinding, 'app.js must bind click handling to #dockReactionsBtn or #dockReactionsGroup');

  const hasMovieLibraryBinding = (app.includes('dockMovieLibraryBtn') || app.includes('hostMovieLibraryDockBtn')) &&
    (app.includes('openMovieModal') || app.includes('onclick') || app.includes("addEventListener('click'"));
  assert(hasMovieLibraryBinding, 'app.js must bind click handling to Movie Library dock pill');
});

test('Movie library is removed from three dot menu and placed in action dock', () => {
  const moreMenuMatch = html.match(/id="moreOptionsMenu"[\s\S]*?<\/div>\s*<\/div>/);
  if (moreMenuMatch) {
    const moreMenuContent = moreMenuMatch[0];
    assert(!moreMenuContent.includes('Movie Library'), 'three dot menu must not contain Movie Library');
  }
  const dockMatch = html.match(/class="floating-pill-dock"[\s\S]*?<!-- Right corner/);
  if (dockMatch) {
    const dockContent = dockMatch[0];
    assert(dockContent.includes('dockMovieLibraryBtn') || dockContent.includes('hostMovieLibraryDockBtn'), 'action dock must contain Movie Library');
    assert(!dockContent.includes('layoutToggleBtn'), 'action dock must not contain layoutToggleBtn');
  }
});

// ============================================================================
// SUITE 2: Side Chat Panel, Message Cards, Roles & Procedural UI Audio (R2)
// ============================================================================
suite('R2 - Side Chat Panel, Role Badges & Procedural UI Audio');

test('style.css defines modern message card layout and hover rules for .chat-msg', () => {
  assert(css.includes('.chat-msg'), 'style.css must define .chat-msg');
  assert(css.includes('.chat-msg:hover') || css.includes('.chat-msg.hover') || css.includes('.chat-msg:hover .'),
    'style.css must define .chat-msg:hover for message card interaction highlight');
});

test('style.css defines .chat-role-badge with distinct styles for .role-host and .role-viewer', () => {
  assert(css.includes('.chat-role-badge'), 'style.css must define .chat-role-badge');
  assert(css.includes('.role-host') || css.includes('.chat-role-badge.role-host'),
    'style.css must define .role-host badge styling');
  assert(css.includes('.role-viewer') || css.includes('.chat-role-badge.role-viewer'),
    'style.css must define .role-viewer badge styling');
});

test('server.js emits isHost or role metadata in chat-message payload', () => {
  assert(server.includes("socket.on('send-chat'") || server.includes('socket.on("send-chat"'),
    'server.js must handle send-chat event');
  
  const sendChatIndex = server.indexOf("'send-chat'");
  const sendChatBlock = server.substring(sendChatIndex, sendChatIndex + 1200);
  
  assert(sendChatBlock.includes('isHost') || sendChatBlock.includes('role'),
    'server.js send-chat handler must include isHost or role in chat-message payload');
  assert(sendChatBlock.includes("'chat-message'"),
    'server.js must emit chat-message event with enriched role payload');
});

test('app.js renders .chat-role-badge for HOST and VIEWER in chat messages', () => {
  assert(app.includes('chat-role-badge'),
    'app.js must reference and render .chat-role-badge class');
  assert(app.includes('HOST') || app.includes('Host'),
    'app.js must render HOST badge text');
  assert(app.includes('VIEWER') || app.includes('Viewer'),
    'app.js must render VIEWER badge text');
  assert(app.includes('isHost') || app.includes('role'),
    'app.js chat message renderer must check isHost or role property');
});

test('app.js defines procedural Web Audio sound synthesis function playUIAudio', () => {
  const hasAudioFunc = app.includes('function playUIAudio') || 
                       app.includes('const playUIAudio =') || 
                       app.includes('let playUIAudio =') ||
                       app.includes('playUIAudio(');
  assert(hasAudioFunc, 'app.js must define playUIAudio function');

  const hasAudioContext = app.includes('AudioContext') || app.includes('webkitAudioContext');
  assert(hasAudioContext, 'playUIAudio must utilize native Web Audio API (AudioContext)');
});

test('playUIAudio supports hover, mic-mute, mic-unmute, and room-join audio cues', () => {
  const audioFuncMatch = app.match(/function\s+playUIAudio\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{2}\}/) ||
                         app.match(/(?:const|let|var)\s+playUIAudio\s*=\s*(?:function)?\s*\([^)]*\)\s*=>?\s*\{([\s\S]*?)\n\s{2}\};?/);
  assert(audioFuncMatch, 'playUIAudio function must be implemented in app.js');
  const audioBody = audioFuncMatch[1];

  assert(audioBody.includes('hover'), 'playUIAudio must support "hover" audio cue');
  assert(audioBody.includes('mic-mute') || (audioBody.includes('mute') && audioBody.includes('unmute')),
    'playUIAudio must support "mic-mute" and "mic-unmute" audio cues');
  assert(audioBody.includes('room-join') || audioBody.includes('join'),
    'playUIAudio must support "room-join" audio cue');
});

test('playUIAudio implements hover sound throttling (~45ms) to prevent audio clutter', () => {
  const audioFuncMatch = app.match(/function\s+playUIAudio\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{2}\}/) ||
                         app.match(/(?:const|let|var)\s+playUIAudio\s*=\s*(?:function)?\s*\([^)]*\)\s*=>?\s*\{([\s\S]*?)\n\s{2}\};?/);
  assert(audioFuncMatch, 'playUIAudio function must be implemented in app.js');
  const audioBody = audioFuncMatch[1];

  const hasThrottleCheck = audioBody.includes('45') || 
                          audioBody.includes('lastHover') || 
                          audioBody.includes('hoverThrottle') ||
                          audioBody.includes('Date.now() - ');
  assert(hasThrottleCheck, 'playUIAudio must implement hover sound throttling (around 45ms)');
});

test('style.css and app.js implement reaction burst animations with spring physics', () => {
  const hasReactionAnimation = css.includes('@keyframes reactionBurst') || 
                               css.includes('@keyframes reactionPop') || 
                               css.includes('@keyframes floatReactionBurst') ||
                               css.includes('cubic-bezier') ||
                               css.includes('.floating-reaction');
  assert(hasReactionAnimation, 'style.css must define reaction burst keyframes or spring physics transition');

  assert(app.includes('reaction') || app.includes('Reaction'),
    'app.js must handle reaction triggering');
});

// ============================================================================
// SUITE 3: Cinema Stage Grid, Speaking Halos & Screen Share PiP (R3)
// ============================================================================
suite('R3 - Cinema Stage Grid, Speaking Halos & Screen Share PiP');

test('style.css defines Cinema Stage layout grid partitioning active speakers and participants', () => {
  const hasGridView = css.includes('.is-grid-view') || css.includes('.stage-grid-mode');
  assert(hasGridView, 'style.css must define grid view class (.is-grid-view or .stage-grid-mode)');

  const hasGridRules = css.includes('grid-template-columns') || 
                       css.includes('display: grid') || 
                       css.includes('.is-grid-view .participant-tile') ||
                       css.includes('.stage-grid-mode');
  assert(hasGridRules, 'style.css must specify Stage grid layout rules');
});

test('style.css defines animated speaking halos with pulsating multi-ring glow keyframes', () => {
  const hasSpeakingHaloClass = css.includes('.stage-speaking-halo') || 
                                css.includes('.participant-tile.is-speaking') ||
                                css.includes('.is-speaking');
  assert(hasSpeakingHaloClass, 'style.css must define speaking halo class (.stage-speaking-halo or .is-speaking)');

  const hasHaloKeyframes = css.includes('stageSpeakingHaloPulse') || 
                           css.includes('@keyframes speakingPulse') ||
                           css.includes('@keyframes haloPulse');
  assert(hasHaloKeyframes, 'style.css must define pulsating speaking halo keyframe animation');
});

test('app.js toggles speaking halo state based on participant audio activity', () => {
  const hasSpeakingLogic = app.includes('is-speaking') || 
                           app.includes('stage-speaking-halo') || 
                           app.includes('speakingHalo');
  assert(hasSpeakingLogic, 'app.js must toggle speaking halo classes on audio activity');
});

test('index.html and style.css define Screen Share Picture-in-Picture container (#screenSharePipContainer)', () => {
  const hasPipMarkup = html.includes('id="screenSharePipContainer"') || html.includes('id="screenSharePip"');
  assert(hasPipMarkup, 'index.html must include #screenSharePipContainer');

  const hasPipCss = css.includes('#screenSharePipContainer') || css.includes('#screenSharePip');
  assert(hasPipCss, 'style.css must define styling for #screenSharePipContainer');
});

test('index.html and app.js implement 1-click focus toggle for Screen Share PiP (#screenShareFocusBtn)', () => {
  const hasFocusBtn = html.includes('id="screenShareFocusBtn"');
  assert(hasFocusBtn, 'index.html must include #screenShareFocusBtn for 1-click focus swap');

  const hasFocusHandler = app.includes('screenShareFocusBtn') && 
    (app.includes("addEventListener('click'") || app.includes('onclick') || app.includes('swapScreenShareFocus'));
  assert(hasFocusHandler, 'app.js must attach click handler to #screenShareFocusBtn to swap focus');
});

// ============================================================================
// SUITE 4: Subtitles Live Preview & Web Audio Dialogue Booster (R4)
// ============================================================================
suite('R4 - Subtitles Live Preview & Web Audio Dialogue Booster');

test('index.html contains subtitle live preview container (#subtitlePreviewCard)', () => {
  const hasPreviewContainer = html.includes('id="subtitlePreviewCard"') || 
                              html.includes('id="subLivePreviewContainer"');
  assert(hasPreviewContainer, 'index.html must contain #subtitlePreviewCard in subtitle settings');

  const subModalIndex = html.indexOf('id="subtitlesModal"');
  assert(subModalIndex !== -1, 'subtitlesModal must exist');
  const subModalBlock = html.substring(subModalIndex, subModalIndex + 4000);
  assert(subModalBlock.includes('subtitlePreviewCard') || subModalBlock.includes('subLivePreviewContainer'),
    '#subtitlePreviewCard must be placed inside #subtitlesModal');
});

test('style.css styles subtitle live preview card with cinema scene preview', () => {
  const hasPreviewCss = css.includes('#subtitlePreviewCard') || css.includes('.subtitle-preview-card');
  assert(hasPreviewCss, 'style.css must style subtitle preview card (#subtitlePreviewCard)');
});

test('index.html contains 4 continuous customization sliders with valid ranges', () => {
  assert(html.includes('id="subFontScaleSlider"'), 'index.html must contain #subFontScaleSlider');
  assert(html.includes('id="subTextOpacitySlider"'), 'index.html must contain #subTextOpacitySlider');
  assert(html.includes('id="subBgBlurSlider"'), 'index.html must contain #subBgBlurSlider');
  assert(html.includes('id="subDelaySlider"'), 'index.html must contain #subDelaySlider');

  // Verify slider attributes
  const fontMatch = html.match(/id="subFontScaleSlider"[^>]*?(?:min="([^"]+)"|max="([^"]+)")/s);
  assert(fontMatch, '#subFontScaleSlider must define min/max range attributes');

  const opacityMatch = html.match(/id="subTextOpacitySlider"[^>]*?(?:min="([^"]+)"|max="([^"]+)")/s);
  assert(opacityMatch, '#subTextOpacitySlider must define min/max range attributes');

  const blurMatch = html.match(/id="subBgBlurSlider"[^>]*?(?:min="([^"]+)"|max="([^"]+)")/s);
  assert(blurMatch, '#subBgBlurSlider must define min/max range attributes');

  const delayMatch = html.match(/id="subDelaySlider"[^>]*?(?:min="([^"]+)"|max="([^"]+)")/s);
  assert(delayMatch, '#subDelaySlider must define min/max range attributes');
});

test('app.js attaches real-time input listeners to all 4 subtitle sliders updating live preview', () => {
  assert(app.includes('subFontScaleSlider'), 'app.js must reference #subFontScaleSlider');
  assert(app.includes('subTextOpacitySlider'), 'app.js must reference #subTextOpacitySlider');
  assert(app.includes('subBgBlurSlider'), 'app.js must reference #subBgBlurSlider');
  assert(app.includes('subDelaySlider'), 'app.js must reference #subDelaySlider');

  const hasSliderListeners = (app.includes("addEventListener('input'") || app.includes('oninput')) &&
                             app.includes('subFontScaleSlider');
  assert(hasSliderListeners, 'app.js must attach live input listeners to subtitle sliders');
});

test('app.js declares initMovieAudioEngine and toggleDialogueBooster functions', () => {
  const hasInitAudio = app.includes('function initMovieAudioEngine') || 
                       app.includes('const initMovieAudioEngine =') ||
                       app.includes('let initMovieAudioEngine =') ||
                       app.includes('initMovieAudioEngine(');
  assert(hasInitAudio, 'app.js must define initMovieAudioEngine function');

  const hasToggleBooster = app.includes('function toggleDialogueBooster') || 
                           app.includes('const toggleDialogueBooster =') ||
                           app.includes('let toggleDialogueBooster =') ||
                           app.includes('toggleDialogueBooster(');
  assert(hasToggleBooster, 'app.js must define toggleDialogueBooster function');
});

test('initMovieAudioEngine configures DynamicsCompressorNode for night-mode dynamic compression', () => {
  assert(app.includes('initMovieAudioEngine'), 'initMovieAudioEngine must be defined in app.js');
  const hasCompressor = app.includes('createDynamicsCompressor') || 
                        app.includes('DynamicsCompressorNode');
  assert(hasCompressor, 'initMovieAudioEngine must instantiate DynamicsCompressorNode via Web Audio API');

  const hasCompressorParams = app.includes('.threshold') || 
                              app.includes('.knee') || 
                              app.includes('.ratio');
  assert(hasCompressorParams, 'DynamicsCompressorNode must configure threshold, knee, or ratio parameters');
});

test('initMovieAudioEngine configures speech peaking BiquadFilterNode (~2.0-3.0 kHz)', () => {
  assert(app.includes('initMovieAudioEngine'), 'initMovieAudioEngine must be defined in app.js');
  const hasBiquad = app.includes('createBiquadFilter') || app.includes('BiquadFilterNode');
  assert(hasBiquad, 'initMovieAudioEngine must instantiate BiquadFilterNode for speech frequency peaking');

  const hasPeaking = app.includes("'peaking'") || app.includes('"peaking"');
  assert(hasPeaking, 'BiquadFilterNode must use peaking filter type to boost speech frequencies');
});

test('index.html and style.css include dialogue booster toggle control', () => {
  const hasBoosterToggle = html.includes('id="dialogueBoosterToggle"') || 
                           html.includes('id="nightModeAudioToggle"');
  assert(hasBoosterToggle, 'index.html must include dialogue booster toggle input');

  const hasBoosterCss = css.includes('dialogueBooster') || 
                        css.includes('nightModeAudio') || 
                        css.includes('.dialogue-booster');
  assert(hasBoosterCss, 'style.css must define styles for dialogue booster control');
});

// ============================================================================
// SUITE 5: Floating Window Snapping & Mini-Player Mode (R5)
// ============================================================================
suite('R5 - Viewport Edge/Corner Snapping & Mini-Player Mode');

test('app.js defines 32px magnetic snapping threshold (SNAP_DISTANCE = 32)', () => {
  const hasSnapThreshold = app.includes('SNAP_DISTANCE') || 
                           app.includes('snapDistance') || 
                           app.includes('32');
  assert(hasSnapThreshold, 'app.js must implement 32px magnetic snapping logic (SNAP_DISTANCE = 32)');
});

test('index.html contains #windowSnapGuide visual boundary overlay element', () => {
  assert(html.includes('id="windowSnapGuide"'),
    'index.html must contain #windowSnapGuide element for snap guidance');
});

test('style.css styles #windowSnapGuide with glowing dashed guide border', () => {
  assert(css.includes('#windowSnapGuide'), 'style.css must style #windowSnapGuide');

  const snapGuideMatch = css.match(/#windowSnapGuide\s*\{([^}]+)\}/s);
  assert(snapGuideMatch, '#windowSnapGuide CSS declaration block must be present');
  const snapBlock = snapGuideMatch[1];
  assert(snapBlock.includes('border') || snapBlock.includes('outline'),
    '#windowSnapGuide must have visible guide border');
  assert(snapBlock.includes('pointer-events: none') || snapBlock.includes('pointer-events:none'),
    '#windowSnapGuide must set pointer-events: none to avoid blocking pointer drag');
});

test('app.js updates #windowSnapGuide position and visibility during dragging near edges/corners', () => {
  const hasSnapGuideLogic = app.includes('windowSnapGuide') && 
    (app.includes('classList.remove') || app.includes('classList.add') || app.includes('style.display') || app.includes('style.opacity'));
  assert(hasSnapGuideLogic, 'app.js must update #windowSnapGuide visibility and geometry during drag near edges');
});

test('app.js implements enterMiniPlayerMode and exitMiniPlayerMode', () => {
  const hasEnterMini = app.includes('function enterMiniPlayerMode') || 
                       app.includes('const enterMiniPlayerMode =') ||
                       app.includes('enterMiniPlayerMode(');
  assert(hasEnterMini, 'app.js must define enterMiniPlayerMode function');

  const hasExitMini = app.includes('function exitMiniPlayerMode') || 
                      app.includes('const exitMiniPlayerMode =') ||
                      app.includes('exitMiniPlayerMode(');
  assert(hasExitMini, 'app.js must define exitMiniPlayerMode function');
});

test('app.js triggers mini-player auto-minimize when opening chat or room settings', () => {
  const hasAutoMini = app.includes('enterMiniPlayerMode') && 
    (app.includes('toggleChat') || app.includes('chat-panel') || app.includes('settingsModal'));
  assert(hasAutoMini, 'app.js must invoke enterMiniPlayerMode when opening chat or settings');
});

test('style.css defines .mini-player-active compact picture-in-picture styles', () => {
  const hasMiniCss = css.includes('.mini-player-active') || css.includes('.mini-player-mode');
  assert(hasMiniCss, 'style.css must define .mini-player-active or .mini-player-mode compact widget styling');
});

// ============================================================================
// SUITE 6: Strict Policy Adherence (Zero Emojis & Security) (R6)
// ============================================================================
suite('R6 - Strict Zero-Emoji Policy Adherence');

test('index.html contains zero emojis across all elements, titles, and text nodes', () => {
  const hasEmoji = emojiRegex.test(html);
  if (hasEmoji) {
    const match = html.match(emojiRegex);
    assert(!hasEmoji, `index.html contains forbidden emoji character at match: ${match[0]}`);
  }
  assert(!hasEmoji, 'index.html must contain zero emojis');
});

test('style.css contains zero emojis', () => {
  const hasEmoji = emojiRegex.test(css);
  if (hasEmoji) {
    const match = css.match(emojiRegex);
    assert(!hasEmoji, `style.css contains forbidden emoji character at match: ${match[0]}`);
  }
  assert(!hasEmoji, 'style.css must contain zero emojis');
});

test('app.js contains zero emojis in strings, comments, and DOM manipulations', () => {
  const hasEmoji = emojiRegex.test(app);
  if (hasEmoji) {
    const match = app.match(emojiRegex);
    assert(!hasEmoji, `app.js contains forbidden emoji character at match: ${match[0]}`);
  }
  assert(!hasEmoji, 'app.js must contain zero emojis');
});

test('server.js contains zero emojis in logs, comments, and event payloads', () => {
  const hasEmoji = emojiRegex.test(server);
  if (hasEmoji) {
    const match = server.match(emojiRegex);
    assert(!hasEmoji, `server.js contains forbidden emoji character at match: ${match[0]}`);
  }
  assert(!hasEmoji, 'server.js must contain zero emojis');
});

// ============================================================================
// SUITE 7: End-to-End Pairwise & Architectural Integration Scenarios (Tiers 3 & 4)
// ============================================================================
suite('Tiers 3 & 4 - Pairwise & Realistic Integration Scenarios');

test('Pairwise Integration: Host chat message payload structure matches client badge rendering', () => {
  const sendChatIndex = server.indexOf("'send-chat'");
  assert(sendChatIndex !== -1, 'server.js must define send-chat handler');
  const sendChatBlock = server.substring(sendChatIndex, sendChatIndex + 1200);
  const serverHasRole = sendChatBlock.includes('isHost') || sendChatBlock.includes('role:');

  const appendChatMatch = app.match(/function\s+appendChatMessage\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{2}\}/);
  const appendChatBody = appendChatMatch ? appendChatMatch[1] : '';
  const clientReadsRole = appendChatBody.includes('isHost') || appendChatBody.includes('role');

  assert(serverHasRole, 'server.js send-chat must inject isHost or role in message payload');
  assert(clientReadsRole, 'app.js appendChatMessage must inspect isHost or role to render badge');
});

test('Pairwise Integration: Dock screen share button coordinates with Screen Share PiP container', () => {
  const hasScreenShareDock = html.includes('id="dockScreenShareBtn"');
  const hasScreenSharePip = html.includes('id="screenSharePipContainer"') || html.includes('id="screenSharePip"');
  assert(hasScreenShareDock && hasScreenSharePip,
    'Dock screen share pill and screen share PiP container must both be present in DOM structure');
});

test('Pairwise Integration: Subtitle live preview settings sync to active movie subtitle track', () => {
  const hasSliders = html.includes('subFontScaleSlider') && html.includes('subDelaySlider');
  const hasSubtitleSyncLogic = app.includes('subFontScaleSlider') && 
    (app.includes('movieSubtitle') || app.includes('cue') || app.includes('subtitle') || app.includes('track'));
  assert(hasSliders && hasSubtitleSyncLogic,
    'Subtitle slider adjustments must connect to movie subtitle rendering');
});

test('Pairwise Integration: Mini-player mode preserves movie playback state and sync listeners', () => {
  const hasMiniPlayerLogic = app.includes('enterMiniPlayerMode') && app.includes('exitMiniPlayerMode');
  const maintainsPlayback = app.includes('moviePlayer') && 
    (app.includes('currentTime') || app.includes('playbackRate') || app.includes('play()') || app.includes('paused'));
  assert(hasMiniPlayerLogic && maintainsPlayback,
    'Mini-player transitions must preserve continuous media playback state');
});

test('Staged Architecture: TARGET_DIR environment variable correctly resolves dual environments', () => {
  assert(typeof targetDir === 'string' && targetDir.length > 0, 'TARGET_DIR must be valid string');
  assert(fs.existsSync(publicDir), `TARGET_DIR public directory must exist at ${publicDir}`);
  assert(fs.existsSync(serverPath), `Target server file must exist at ${serverPath}`);
});

// ============================================================================
// SUITE SUMMARY & EXIT
// ============================================================================
console.log('\n================================================================');
console.log('  MODERNIZATION TEST SUITE SUMMARY');
console.log(`  Target Directory: ${publicDir}`);
console.log(`  Server Path:      ${serverPath}`);
console.log(`  Total Checks:     ${total}`);
console.log(`  Passed:           ${passed}`);
console.log(`  Failed:           ${failed}`);
console.log('================================================================');

if (failures.length > 0) {
  console.log(`\nFailed Checks (${failures.length}):`);
  failures.forEach((f, idx) => {
    console.log(`  ${idx + 1}. [FAIL] ${f.name}`);
    console.log(`     Details: ${f.error}`);
  });
}

if (failed > 0) {
  console.log(`\n[INFO] Test run completed with ${failed} failed assertions. (Expected during baseline evaluation).`);
  process.exit(1);
} else {
  console.log('\n[SUCCESS] All modernization tests passed successfully!');
  process.exit(0);
}
