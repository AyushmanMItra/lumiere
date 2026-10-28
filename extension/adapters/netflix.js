// ==========================================================================
// Lumiere Extension - Netflix Adapter
// Finds the Netflix Cadmium player video element and exposes controls
// Bridges with netflix-page.js to control Cadmium player API
// ==========================================================================

(() => {
  // Inject page-level bridge for Cadmium API
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const scriptUrl = chrome.runtime.getURL('adapters/netflix-page.js');
      const script = document.createElement('script');
      script.src = scriptUrl;
      (document.head || document.documentElement).appendChild(script);
    }
  } catch (e) {}

  function findNetflixVideo() {
    // Netflix uses a single <video> element inside their player container
    // The Cadmium player wraps it in .watch-video--player-view
    const video = document.querySelector('.watch-video--player-view video')
      || document.querySelector('[data-uia*="video-canvas"] video')
      || document.querySelector('.nf-player-container video')
      || document.querySelector('video[src]')
      || document.querySelector('video');
    return video || null;
  }

  function getTitle() {
    // Netflix shows the title in the player UI
    const titleEl = document.querySelector('[data-uia="video-title"]')
      || document.querySelector('.video-title h4')
      || document.querySelector('.ellipsize-text');
    if (titleEl && titleEl.textContent.trim()) return titleEl.textContent.trim();

    // Fallback: parse from URL /watch/ID
    const match = window.location.pathname.match(/\/watch\/(\d+)/);
    return match ? `Netflix Title (${match[1]})` : 'Netflix';
  }

  function getContentUrl() {
    return window.location.href;
  }

  function seek(video, time) {
    if (!video) return;
    // 1. Send to Cadmium player API in main world
    try {
      window.postMessage({
        source: 'lumiere-extension-content',
        type: 'LUMIERE_NETFLIX_SEEK',
        time: time
      }, '*');
    } catch (e) {}

    // 2. DOM fallback
    try {
      video.currentTime = time;
      video.dispatchEvent(new Event('seeking'));
      video.dispatchEvent(new Event('seeked'));
    } catch (e) {
      console.warn('[Lumiere Netflix] Seek error:', e);
    }
  }

  function play(video) {
    if (!video) return;
    try {
      window.postMessage({
        source: 'lumiere-extension-content',
        type: 'LUMIERE_NETFLIX_PLAY'
      }, '*');
    } catch (e) {}

    const playBtn = document.querySelector('[data-uia="control-play-pause-play"], .button-nfplayerPlay');
    if (playBtn) {
      try { playBtn.click(); return; } catch (e) {}
    }
    video.play().catch(() => {});
  }

  function pause(video) {
    if (!video) return;
    try {
      window.postMessage({
        source: 'lumiere-extension-content',
        type: 'LUMIERE_NETFLIX_PAUSE'
      }, '*');
    } catch (e) {}

    const pauseBtn = document.querySelector('[data-uia="control-play-pause-pause"], .button-nfplayerPause');
    if (pauseBtn) {
      try { pauseBtn.click(); return; } catch (e) {}
    }
    video.pause();
  }

  window.__lumiere_adapter = {
    platform: 'netflix',
    getVideo: findNetflixVideo,
    getTitle: getTitle,
    getContentUrl: getContentUrl,
    seek: seek,
    play: play,
    pause: pause
  };
})();
