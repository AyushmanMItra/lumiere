// ==========================================================================
// Lumiere Extension - Zee5 Adapter
// Finds the Zee5 player video element and exposes controls
// ==========================================================================

(() => {
  function findZee5Video() {
    const video = document.querySelector('.player-container video')
      || document.querySelector('[class*="shaka"] video')
      || document.querySelector('[class*="video-player"] video')
      || document.querySelector('video[src]')
      || document.querySelector('video');
    return video || null;
  }

  function getTitle() {
    const titleEl = document.querySelector('[class*="content-title"]')
      || document.querySelector('[class*="episodeTitle"]')
      || document.querySelector('h1[class*="title"]')
      || document.querySelector('.player-title');
    if (titleEl && titleEl.textContent.trim()) return titleEl.textContent.trim();

    let docTitle = document.title || 'Zee5';
    docTitle = docTitle.replace(/\s*[-–|•]\s*ZEE5.*$/i, '').trim();
    return docTitle || 'Zee5';
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
      console.warn('[Lumiere Zee5] Seek error:', e);
    }
  }

  function play(video) {
    if (!video) return;
    const playBtn = document.querySelector('.playPauseIcon, button[class*="playBtn"]');
    if (playBtn && video.paused) {
      try { playBtn.click(); return; } catch (e) {}
    }
    video.play().catch(() => {});
  }

  function pause(video) {
    if (!video) return;
    const pauseBtn = document.querySelector('.playPauseIcon, button[class*="pauseBtn"]');
    if (pauseBtn && !video.paused) {
      try { pauseBtn.click(); return; } catch (e) {}
    }
    video.pause();
  }

  window.__lumiere_adapter = {
    platform: 'zee5',
    getVideo: findZee5Video,
    getTitle: getTitle,
    getContentUrl: getContentUrl,
    seek: seek,
    play: play,
    pause: pause
  };
})();
