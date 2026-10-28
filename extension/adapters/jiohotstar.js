// ==========================================================================
// Lumiere Extension - JioHotstar Adapter
// Finds the Hotstar / JioHotstar player video element and exposes controls
// ==========================================================================

(() => {
  function findHotstarVideo() {
    const video = document.querySelector('[class*="player-base"] video')
      || document.querySelector('.shaka-video-container video')
      || document.querySelector('.player-container video')
      || document.querySelector('[data-testid="player-video"] video')
      || document.querySelector('video[src]')
      || document.querySelector('video');
    return video || null;
  }

  function getTitle() {
    const titleEl = document.querySelector('[class*="content-title"]')
      || document.querySelector('[class*="showTitle"]')
      || document.querySelector('h1[class*="title"]')
      || document.querySelector('[data-testid="content-title"]')
      || document.querySelector('.tray-title');
    if (titleEl && titleEl.textContent.trim()) return titleEl.textContent.trim();

    let docTitle = document.title || 'JioHotstar';
    docTitle = docTitle.replace(/\s*[-–|•]\s*(Hotstar|JioHotstar).*$/i, '').trim();
    return docTitle || 'JioHotstar';
  }

  function getContentUrl() {
    return window.location.href;
  }

  function seek(video, time) {
    if (!video) return;
    try {
      video.currentTime = time;
      video.dispatchEvent(new Event('seeking'));
      video.dispatchEvent(new Event('seeked'));
    } catch (e) {
      console.warn('[Lumiere JioHotstar] Seek error:', e);
    }
  }

  function play(video) {
    if (!video) return;
    const playBtn = document.querySelector('[data-testid="play-pause-button"], button[aria-label*="Play"]');
    if (playBtn && video.paused) {
      try { playBtn.click(); return; } catch (e) {}
    }
    video.play().catch(() => {});
  }

  function pause(video) {
    if (!video) return;
    const pauseBtn = document.querySelector('[data-testid="play-pause-button"], button[aria-label*="Pause"]');
    if (pauseBtn && !video.paused) {
      try { pauseBtn.click(); return; } catch (e) {}
    }
    video.pause();
  }

  window.__lumiere_adapter = {
    platform: 'jiohotstar',
    getVideo: findHotstarVideo,
    getTitle: getTitle,
    getContentUrl: getContentUrl,
    seek: seek,
    play: play,
    pause: pause
  };
})();
