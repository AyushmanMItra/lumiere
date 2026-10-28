// ==========================================================================
// Lumiere Extension - Generic / Universal HTML5 Video Adapter
// Supports Disney+, SonyLIV, Crunchyroll, and any HTML5 video player
// ==========================================================================

(() => {
  function findGenericVideo() {
    // 1. Look for video with src or currentSrc
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0];

    // If multiple videos (e.g. background ads), pick the largest visible one
    let bestVideo = null;
    let maxArea = 0;

    for (const v of videos) {
      const rect = v.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea && rect.width > 160 && rect.height > 90) {
        maxArea = area;
        bestVideo = v;
      }
    }

    return bestVideo || videos[0];
  }

  function getTitle() {
    // Check common title selectors across streaming sites
    const titleEl = document.querySelector('[class*="title-info"]')
      || document.querySelector('[class*="video-title"]')
      || document.querySelector('[class*="player-title"]')
      || document.querySelector('h1')
      || document.querySelector('h2');

    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim().slice(0, 100);
    }

    // Clean up document.title (strip site suffixes)
    let docTitle = document.title || 'Streaming Video';
    docTitle = docTitle.replace(/\s*[-–|•]\s*(Disney\+|SonyLIV|Hotstar|Prime Video|Netflix|Zee5|Watch Online).*$/i, '').trim();
    return docTitle || 'Streaming Video';
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
      console.warn('[Lumiere Universal Adapter] Seek error:', e);
    }
  }

  function play(video) {
    if (!video) return;
    video.play().catch(() => {});
  }

  function pause(video) {
    if (!video) return;
    video.pause();
  }

  // Detect platform name from hostname
  function detectPlatform() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('disneyplus')) return 'disneyplus';
    if (host.includes('sonyliv')) return 'sonyliv';
    if (host.includes('crunchyroll')) return 'crunchyroll';
    if (host.includes('hotstar')) return 'jiohotstar';
    if (host.includes('zee5')) return 'zee5';
    if (host.includes('netflix')) return 'netflix';
    if (host.includes('amazon') || host.includes('primevideo')) return 'primevideo';
    return 'universal';
  }

  window.__lumiere_adapter = {
    platform: detectPlatform(),
    getVideo: findGenericVideo,
    getTitle: getTitle,
    getContentUrl: getContentUrl,
    seek: seek,
    play: play,
    pause: pause
  };
})();
