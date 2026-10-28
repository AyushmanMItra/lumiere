// ==========================================================================
// Lumiere Extension - Netflix Main World Bridge
// Injected into page context to interact with Netflix Cadmium video player API
// ==========================================================================

(() => {
  function getNetflixPlayer() {
    try {
      const netflix = window.netflix;
      if (netflix && netflix.appContext && netflix.appContext.state && netflix.appContext.state.playerApp) {
        const vp = netflix.appContext.state.playerApp.getAPI().videoPlayer;
        const sessionIds = vp.getAllPlayerSessionIds();
        if (sessionIds && sessionIds.length > 0) {
          return vp.getVideoPlayerBySessionId(sessionIds[sessionIds.length - 1]);
        }
      }
    } catch (e) {
      // In case API structure changes
    }
    return null;
  }

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'lumiere-extension-content') return;

    const { type, time } = event.data;
    const player = getNetflixPlayer();

    if (type === 'LUMIERE_NETFLIX_SEEK' && typeof time === 'number') {
      const timeMs = Math.round(time * 1000);
      if (player && typeof player.seek === 'function') {
        try {
          player.seek(timeMs);
          return;
        } catch (e) {}
      }
    } else if (type === 'LUMIERE_NETFLIX_PLAY') {
      if (player && typeof player.play === 'function') {
        try {
          player.play();
          return;
        } catch (e) {}
      }
    } else if (type === 'LUMIERE_NETFLIX_PAUSE') {
      if (player && typeof player.pause === 'function') {
        try {
          player.pause();
          return;
        } catch (e) {}
      }
    }
  });
})();
