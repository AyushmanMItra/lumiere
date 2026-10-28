// ==========================================================================
// Lumiere Extension - Prime Video Adapter
// Finds the Prime Video / Amazon Video player element and exposes controls
// ==========================================================================

(() => {
  function findPrimeVideo() {
    const video = document.querySelector('.dv-player-fullscreen video')
      || document.querySelector('[class*="webPlayerContainer"] video')
      || document.querySelector('.rendererContainer video')
      || document.querySelector('.cascadesContainer video')
      || document.querySelector('.dv-playback-container video')
      || document.querySelector('video[src]')
      || document.querySelector('video');
    return video || null;
  }

  function getTitle() {
    const titleEl = document.querySelector('[data-automation-id="title"]')
      || document.querySelector('.atvwebplayersdk-title-text')
      || document.querySelector('h1[class*="title"]')
      || document.querySelector('[class*="title"]');
    if (titleEl && titleEl.textContent.trim()) return titleEl.textContent.trim();

    const subtitleEl = document.querySelector('[data-automation-id="subtitle"]')
      || document.querySelector('.atvwebplayersdk-subtitle-text');
    if (subtitleEl && subtitleEl.textContent.trim()) return subtitleEl.textContent.trim();

    let docTitle = document.title || 'Prime Video';
    docTitle = docTitle.replace(/\s*[-–|•]\s*Prime Video.*$/i, '').trim();
    return docTitle || 'Prime Video';
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
      console.warn('[Lumiere Prime Video] Seek error:', e);
    }
  }

  function play(video) {
    if (!video) return;
    const playBtn = document.querySelector('[data-automation-id="play-button"], button[aria-label*="Play"]');
    if (playBtn) {
      try { playBtn.click(); return; } catch (e) {}
    }
    video.play().catch(() => {});
  }

  function pause(video) {
    if (!video) return;
    const pauseBtn = document.querySelector('[data-automation-id="pause-button"], button[aria-label*="Pause"]');
    if (pauseBtn) {
      try { pauseBtn.click(); return; } catch (e) {}
    }
    video.pause();
  }

  window.__lumiere_adapter = {
    platform: 'primevideo',
    getVideo: findPrimeVideo,
    getTitle: getTitle,
    getContentUrl: getContentUrl,
    seek: seek,
    play: play,
    pause: pause
  };
})();
