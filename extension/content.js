// ==========================================================================
// Lumiere Extension - Content Script
// Injected into streaming service pages. Connects to Lumiere server via
// Socket.IO and synchronizes playback using platform-specific adapters.
// ==========================================================================

(() => {
  // Prevent double injection
  if (window.__lumiere_content_loaded) return;
  window.__lumiere_content_loaded = true;

  let socket = null;
  let adapter = null;
  let roomId = null;
  let username = null;
  let serverBaseUrl = null;
  let selfId = null;
  let isHost = false;
  let members = [];
  let connected = false;
  let suppressLocalEvents = false;
  let heartbeatInterval = null;
  let lastSyncTime = 0;
  let chatMessages = [];
  let attachedVideoElement = null;

  // The adapter is set by the platform-specific script that loads before this one
  function getAdapter() {
    if (!adapter && window.__lumiere_adapter) {
      adapter = window.__lumiere_adapter;
    }
    return adapter;
  }

  function getVideo() {
    const a = getAdapter();
    if (a && typeof a.getVideo === 'function') {
      const v = a.getVideo();
      if (v) return v;
    }
    return document.querySelector('video') || null;
  }

  // =====================================================
  // Socket.IO Connection
  // =====================================================

  function resolveSocketIO(serverUrl) {
    return new Promise((resolve, reject) => {
      // 1. Check if bundled into content script scope
      if (typeof io !== 'undefined') {
        resolve(io);
        return;
      }
      if (typeof window.io !== 'undefined') {
        resolve(window.io);
        return;
      }

      // 2. Fallback to dynamic loading if not pre-bundled
      const script = document.createElement('script');
      script.src = serverUrl.replace(/\/$/, '') + '/socket.io/socket.io.js';
      script.onload = () => {
        const clientIo = typeof io !== 'undefined' ? io : window.io;
        if (clientIo) resolve(clientIo);
        else reject(new Error('Socket.IO loaded but io object missing'));
      };
      script.onerror = () => reject(new Error('Failed to load Socket.IO from server'));
      document.head.appendChild(script);
    });
  }

  async function connectToServer(serverUrl, room, user) {
    serverBaseUrl = serverUrl.replace(/\/$/, '');
    roomId = room;
    username = user || ('Viewer_' + Math.floor(1000 + Math.random() * 9000));

    try {
      const clientIo = await resolveSocketIO(serverBaseUrl);

      if (socket) {
        socket.disconnect();
        socket = null;
      }

      socket = clientIo(serverBaseUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 15
      });

      socket.on('connect', () => {
        connected = true;
        socket.emit('join-room', { roomId, username });
        updateOverlayStatus('connected');
        startHeartbeat();
      });

      socket.on('disconnect', () => {
        connected = false;
        updateOverlayStatus('disconnected');
        stopHeartbeat();
      });

      socket.on('connect_error', () => {
        updateOverlayStatus('error');
      });

      socket.on('room-joined', (data) => {
        selfId = data.selfId;
        isHost = Boolean(data.isHost);
        members = data.members || [];
        updateOverlayMembers();
        updateOverlayStatus('connected');

        // Sync to current room state if playing
        if (data.isPlaying && typeof data.currentTime === 'number' && data.currentTime > 0) {
          const video = getVideo();
          if (video) {
            suppressLocalEvents = true;
            seekVideo(video, data.currentTime);
            playVideo(video);
            setTimeout(() => { suppressLocalEvents = false; }, 800);
          }
        }
      });

      socket.on('member-joined', (member) => {
        if (!members.some(m => m.id === member.id)) {
          members.push(member);
        }
        updateOverlayMembers();
        addChatSystemMessage(`${member.username} joined the room`);
      });

      socket.on('member-left', ({ id }) => {
        const member = members.find(m => m.id === id);
        members = members.filter(m => m.id !== id);
        updateOverlayMembers();
        if (member) {
          addChatSystemMessage(`${member.username} left the room`);
        }
      });

      socket.on('host-changed', ({ newHostId, newHostName }) => {
        isHost = (newHostId === selfId);
        members.forEach(m => m.isHost = (m.id === newHostId));
        updateOverlayMembers();
        addChatSystemMessage(`${newHostName} is now the host`);
      });

      // Playback sync events
      socket.on('sync-play', ({ time }) => {
        const video = getVideo();
        if (!video) return;
        suppressLocalEvents = true;
        if (typeof time === 'number' && Math.abs(video.currentTime - time) > 2.0) {
          seekVideo(video, time);
        }
        playVideo(video);
        setTimeout(() => { suppressLocalEvents = false; }, 800);
      });

      socket.on('sync-pause', ({ time }) => {
        const video = getVideo();
        if (!video) return;
        suppressLocalEvents = true;
        pauseVideo(video);
        if (typeof time === 'number' && Math.abs(video.currentTime - time) > 3.0) {
          seekVideo(video, time);
        }
        setTimeout(() => { suppressLocalEvents = false; }, 800);
      });

      socket.on('sync-seek', ({ time }) => {
        const video = getVideo();
        if (!video) return;
        suppressLocalEvents = true;
        seekVideo(video, time);
        lastSyncTime = Date.now();
        setTimeout(() => { suppressLocalEvents = false; }, 800);
      });

      // Streaming party dock actions (Play, Pause, Seek, Skip 10s)
      socket.on('sync-streaming-action', ({ action, time }) => {
        const video = getVideo();
        if (!video) return;
        suppressLocalEvents = true;
        if (action === 'play') {
          playVideo(video);
        } else if (action === 'pause') {
          pauseVideo(video);
        } else if (action === 'seek' && typeof time === 'number') {
          seekVideo(video, time);
        } else if (action === 'rewind10') {
          seekVideo(video, typeof time === 'number' ? time : Math.max(0, video.currentTime - 10));
        } else if (action === 'forward10') {
          seekVideo(video, typeof time === 'number' ? time : video.currentTime + 10);
        }
        setTimeout(() => { suppressLocalEvents = false; }, 800);
      });

      // Heartbeat sync (Lumiere micro-drift rate steering)
      socket.on('sync-heartbeat', ({ time, isPlaying }) => {
        if (isHost) return;
        if (Date.now() - lastSyncTime < 3000) return;

        const video = getVideo();
        if (!video) return;

        if (isPlaying && video.paused) {
          playVideo(video);
        } else if (!isPlaying && !video.paused) {
          pauseVideo(video);
          return;
        }

        const drift = time - video.currentTime;
        if (Math.abs(drift) > 3.5) {
          suppressLocalEvents = true;
          seekVideo(video, time);
          lastSyncTime = Date.now();
          setTimeout(() => { suppressLocalEvents = false; }, 800);
        } else if (drift > 0.25) {
          video.playbackRate = 1.06;
        } else if (drift < -0.25) {
          video.playbackRate = 0.95;
        } else {
          if (video.playbackRate !== 1.0) video.playbackRate = 1.0;
        }
      });

      // In-Room Chat
      socket.on('chat-message', (msg) => {
        chatMessages.push(msg);
        if (chatMessages.length > 200) chatMessages.shift();
        renderChatMessage(msg);
      });

      // Streaming title changes (episode switch, movie change)
      socket.on('sync-streaming-changed', (data) => {
        addChatSystemMessage(`${data.sharerName || 'Host'} switched title to: ${data.title}`);
        showTitleChangeBanner(data);
      });

      // Party stopped by Host
      socket.on('sync-movie-stopped', () => {
        const video = getVideo();
        if (video) {
          suppressLocalEvents = true;
          pauseVideo(video);
          setTimeout(() => { suppressLocalEvents = false; }, 800);
        }
        updateOverlayStatus('stopped');
        addChatSystemMessage('Watch party ended by host');
      });

      // Playback speed sync
      socket.on('sync-speed-changed', ({ speed }) => {
        const video = getVideo();
        if (video && typeof speed === 'number') {
          video.playbackRate = speed;
        }
      });

      setupVideoEventListeners();

    } catch (err) {
      console.error('[Lumiere Extension] Connection failed:', err);
      updateOverlayStatus('error');
    }
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    connected = false;
    stopHeartbeat();
    removeVideoEventListeners();
    updateOverlayStatus('disconnected');
  }

  function seekVideo(video, time) {
    const a = getAdapter();
    if (a && typeof a.seek === 'function') {
      a.seek(video, time);
    } else {
      video.currentTime = time;
    }
  }

  function playVideo(video) {
    const a = getAdapter();
    if (a && typeof a.play === 'function') {
      a.play(video);
    } else {
      video.play().catch(() => {});
    }
  }

  function pauseVideo(video) {
    const a = getAdapter();
    if (a && typeof a.pause === 'function') {
      a.pause(video);
    } else {
      video.pause();
    }
  }

  // =====================================================
  // Video Event Listeners
  // =====================================================

  function onVideoPlay() {
    if (suppressLocalEvents || !socket || !connected) return;
    const video = getVideo();
    if (!video) return;
    socket.emit('host-play', { roomId, time: video.currentTime });
  }

  function onVideoPause() {
    if (suppressLocalEvents || !socket || !connected) return;
    const video = getVideo();
    if (!video) return;
    socket.emit('host-pause', { roomId, time: video.currentTime });
  }

  function onVideoSeeked() {
    if (suppressLocalEvents || !socket || !connected) return;
    const video = getVideo();
    if (!video) return;
    socket.emit('host-seek', { roomId, time: video.currentTime });
  }

  function setupVideoEventListeners() {
    const checkAndAttach = () => {
      const currentVideo = getVideo();
      if (!currentVideo) return false;

      if (currentVideo !== attachedVideoElement) {
        removeVideoEventListeners();
        currentVideo.addEventListener('play', onVideoPlay);
        currentVideo.addEventListener('pause', onVideoPause);
        currentVideo.addEventListener('seeked', onVideoSeeked);
        attachedVideoElement = currentVideo;
      }
      return true;
    };

    if (!checkAndAttach()) {
      // Observe DOM for dynamic video element insertion
      const observer = new MutationObserver(() => {
        if (checkAndAttach()) {
          // Keep observing in case user switches episodes
        }
      });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

      // Interval fallback
      let retries = 0;
      const retryInterval = setInterval(() => {
        if (checkAndAttach() || retries++ > 60) {
          clearInterval(retryInterval);
        }
      }, 1000);
    }
  }

  function removeVideoEventListeners() {
    if (attachedVideoElement) {
      attachedVideoElement.removeEventListener('play', onVideoPlay);
      attachedVideoElement.removeEventListener('pause', onVideoPause);
      attachedVideoElement.removeEventListener('seeked', onVideoSeeked);
      attachedVideoElement = null;
    }
  }

  // =====================================================
  // Heartbeat & Host Title Tracking
  // =====================================================

  let lastKnownTitle = null;
  let lastKnownUrl = null;

  function checkAndBroadcastTitleChange() {
    if (!isHost || !socket || !connected) return;
    const a = getAdapter();
    if (!a) return;
    const currentTitle = typeof a.getTitle === 'function' ? a.getTitle() : document.title;
    const currentUrl = typeof a.getContentUrl === 'function' ? a.getContentUrl() : window.location.href;

    if (!lastKnownTitle && !lastKnownUrl) {
      lastKnownTitle = currentTitle;
      lastKnownUrl = currentUrl;
      return;
    }

    if ((currentTitle && currentTitle !== lastKnownTitle) || (currentUrl && currentUrl !== lastKnownUrl)) {
      lastKnownTitle = currentTitle;
      lastKnownUrl = currentUrl;
      socket.emit('host-set-streaming', {
        roomId,
        platform: a.platform || 'streaming',
        title: currentTitle,
        url: currentUrl
      });
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      if (!socket || !connected) return;
      const video = getVideo();
      if (!video) return;
      socket.emit('host-heartbeat', {
        roomId,
        time: video.currentTime,
        isPlaying: !video.paused
      });
      if (isHost) {
        checkAndBroadcastTitleChange();
      }
    }, 2500);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  // =====================================================
  // Overlay UI
  // =====================================================

  let overlayEl = null;

  function createOverlay() {
    if (overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'lumiere-overlay';
    overlayEl.innerHTML = `
      <div id="lumiere-status-bar" class="lumiere-status-bar" title="Drag to reposition">
        <div class="lumiere-brand" id="lumiere-drag-handle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <rect x="2" y="2" width="20" height="20" rx="3"></rect>
            <line x1="7" y1="2" x2="7" y2="22"></line>
            <line x1="17" y1="2" x2="17" y2="22"></line>
            <line x1="2" y1="12" x2="22" y2="12"></line>
          </svg>
          <span>Lumière</span>
        </div>
        <div class="lumiere-status-indicator" id="lumiere-status-dot">
          <span class="lumiere-dot"></span>
          <span class="lumiere-status-text" id="lumiere-status-text">Disconnected</span>
        </div>
        <div class="lumiere-members" id="lumiere-members-list"></div>
        <div class="lumiere-bar-actions">
          <button id="lumiere-stage-btn" class="lumiere-bar-btn" title="Open Lumière WebRTC Call & Theater">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 10l5-5v14l-5-5"></path>
              <rect x="2" y="6" width="13" height="12" rx="2"></rect>
            </svg>
          </button>
          <button id="lumiere-chat-toggle" class="lumiere-bar-btn" title="Toggle Chat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
            <span class="lumiere-chat-badge hidden" id="lumiere-chat-badge">0</span>
          </button>
          <button id="lumiere-minimize-btn" class="lumiere-bar-btn" title="Minimize">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
      <div id="lumiere-chat-panel" class="lumiere-chat-panel hidden">
        <div class="lumiere-chat-header">
          <span>Room Chat</span>
          <button id="lumiere-close-chat" class="lumiere-chat-close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="lumiere-chat-messages" id="lumiere-chat-messages"></div>
        <form class="lumiere-chat-input-bar" id="lumiere-chat-form">
          <input type="text" id="lumiere-chat-input" placeholder="Chat with room..." autocomplete="off" maxlength="500">
          <button type="submit" class="lumiere-send-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(overlayEl);

    // Make overlay draggable
    makeDraggable(overlayEl, document.getElementById('lumiere-drag-handle'));

    // Event listeners
    document.getElementById('lumiere-chat-toggle').addEventListener('click', toggleChat);
    document.getElementById('lumiere-close-chat').addEventListener('click', toggleChat);
    document.getElementById('lumiere-minimize-btn').addEventListener('click', () => {
      overlayEl.classList.toggle('lumiere-minimized');
    });

    document.getElementById('lumiere-stage-btn').addEventListener('click', () => {
      const url = serverBaseUrl ? `${serverBaseUrl}/#${roomId || ''}` : 'http://localhost:3000';
      window.open(url, '_blank');
    });

    document.getElementById('lumiere-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('lumiere-chat-input');
      const text = input.value.trim();
      if (!text || !socket || !connected) return;
      socket.emit('send-chat', { roomId, text });
      input.value = '';
    });
  }

  function makeDraggable(element, handle) {
    let posX = 0, posY = 0, initialX = 0, initialY = 0;
    const target = handle || element;

    target.onmousedown = (e) => {
      e.preventDefault();
      initialX = e.clientX;
      initialY = e.clientY;
      document.onmouseup = () => {
        document.onmouseup = null;
        document.onmousemove = null;
      };
      document.onmousemove = (moveEvent) => {
        moveEvent.preventDefault();
        posX = initialX - moveEvent.clientX;
        posY = initialY - moveEvent.clientY;
        initialX = moveEvent.clientX;
        initialY = moveEvent.clientY;
        element.style.top = (element.offsetTop - posY) + 'px';
        element.style.left = (element.offsetLeft - posX) + 'px';
        element.style.right = 'auto';
      };
    };
  }

  function toggleChat() {
    const panel = document.getElementById('lumiere-chat-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    const badge = document.getElementById('lumiere-chat-badge');
    if (badge && !panel.classList.contains('hidden')) {
      badge.classList.add('hidden');
      badge.textContent = '0';
    }
  }

  function updateOverlayStatus(status) {
    createOverlay();
    const dot = document.querySelector('#lumiere-status-dot .lumiere-dot');
    const text = document.getElementById('lumiere-status-text');
    if (!dot || !text) return;

    dot.className = 'lumiere-dot';
    if (status === 'connected') {
      dot.classList.add('lumiere-dot-connected');
      text.textContent = `Room: ${roomId || '---'}`;
    } else if (status === 'stopped') {
      dot.classList.add('lumiere-dot-error');
      text.textContent = 'Party Ended';
    } else if (status === 'error') {
      dot.classList.add('lumiere-dot-error');
      text.textContent = 'Connection Error';
    } else {
      dot.classList.add('lumiere-dot-disconnected');
      text.textContent = 'Disconnected';
    }
  }

  function showTitleChangeBanner(data) {
    if (!data || !data.title) return;
    let banner = document.getElementById('lumiere-title-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'lumiere-title-banner';
      banner.className = 'lumiere-title-banner';
      document.body.appendChild(banner);
    }
    const currentUrl = window.location.href;
    const isDifferentUrl = Boolean(data.url && data.url !== '#' && !currentUrl.includes(data.url) && !data.url.includes(currentUrl));
    banner.innerHTML = `
      <div class="lumiere-title-banner-content">
        <span>🎬 <strong>${escapeHtml(data.sharerName || 'Host')}</strong> switched to <em>${escapeHtml(data.title)}</em></span>
        ${isDifferentUrl ? `<a href="${escapeHtml(data.url)}" class="lumiere-nav-link">Switch to Video</a>` : ''}
        <button type="button" class="lumiere-banner-close" title="Dismiss">&times;</button>
      </div>
    `;
    const closeBtn = banner.querySelector('.lumiere-banner-close');
    if (closeBtn) closeBtn.onclick = () => banner.remove();
    setTimeout(() => { if (banner && banner.parentNode) banner.remove(); }, 12000);
  }

  function updateOverlayMembers() {
    const el = document.getElementById('lumiere-members-list');
    if (!el) return;
    el.innerHTML = members.map(m => {
      const hostBadge = m.isHost ? '<span class="lumiere-host-badge">HOST</span>' : '';
      return `<span class="lumiere-member-pill" style="border-color:${m.color}">${escapeHtml(m.username)}${hostBadge}</span>`;
    }).join('');
  }

  function renderChatMessage(msg) {
    const container = document.getElementById('lumiere-chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'lumiere-chat-msg';
    div.innerHTML = `
      <span class="lumiere-chat-user" style="color:${msg.color}">${escapeHtml(msg.username)}</span>
      <span class="lumiere-chat-time">${escapeHtml(msg.timestamp || '')}</span>
      <div class="lumiere-chat-text">${escapeHtml(msg.text)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    const panel = document.getElementById('lumiere-chat-panel');
    if (panel && panel.classList.contains('hidden')) {
      const badge = document.getElementById('lumiere-chat-badge');
      if (badge) {
        const count = parseInt(badge.textContent || '0', 10) + 1;
        badge.textContent = String(count);
        badge.classList.remove('hidden');
      }
    }
  }

  function addChatSystemMessage(text) {
    const container = document.getElementById('lumiere-chat-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'lumiere-chat-system';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // =====================================================
  // Message Handling from Background / Popup
  // =====================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'CONNECT_TO_SERVER':
        connectToServer(message.serverUrl, message.roomId, message.username);
        sendResponse({ success: true });
        break;

      case 'DISCONNECT_FROM_SERVER':
        disconnect();
        sendResponse({ success: true });
        break;

      case 'SEND_CHAT_MESSAGE':
        if (socket && connected) {
          socket.emit('send-chat', { roomId, text: message.text });
        }
        sendResponse({ success: true });
        break;

      case 'GET_CONTENT_STATE':
        sendResponse({
          connected,
          roomId,
          username,
          platform: getAdapter()?.platform || null,
          memberCount: members.length
        });
        break;

      default:
        sendResponse({});
    }
    return true;
  });

  // Notify background that content script is ready
  const a = getAdapter();
  chrome.runtime.sendMessage({
    type: 'CONTENT_SCRIPT_READY',
    platform: a ? a.platform : 'streaming'
  }).catch(() => {});

  // Create overlay immediately on supported pages
  createOverlay();
})();
