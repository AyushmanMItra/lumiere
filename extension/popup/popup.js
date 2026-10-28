// ==========================================================================
// Lumiere Extension - Popup Script
// Handles UI for creating/joining rooms and connecting to Lumiere server
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  const els = {
    serverUrl: document.getElementById('serverUrl'),
    username: document.getElementById('username'),
    roomId: document.getElementById('roomId'),
    randomRoomBtn: document.getElementById('randomRoomBtn'),
    connectBtn: document.getElementById('connectBtn'),
    connectForm: document.getElementById('connectForm'),
    connectedPanel: document.getElementById('connectedPanel'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    openTheaterBtn: document.getElementById('openTheaterBtn'),
    connectedRoom: document.getElementById('connectedRoom'),
    connectedUser: document.getElementById('connectedUser'),
    connectedPlatform: document.getElementById('connectedPlatform'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText')
  };

  let activeServerUrl = 'http://localhost:3000';
  let activeRoomId = '';

  function generateRandomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Load saved state
  chrome.storage.local.get(
    ['lumiere_serverUrl', 'lumiere_username', 'lumiere_roomId'],
    (data) => {
      if (data.lumiere_serverUrl) els.serverUrl.value = data.lumiere_serverUrl;
      if (data.lumiere_username) els.username.value = data.lumiere_username;
      if (data.lumiere_roomId) {
        els.roomId.value = data.lumiere_roomId;
      }

      // Auto-detect open Lumière rooms if roomId is empty or default
      if (chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({}, (tabs) => {
          if (!tabs || tabs.length === 0) {
            if (!els.roomId.value) els.roomId.value = generateRandomCode();
            return;
          }
          const lumiereTab = tabs.find(t => t.url && (t.url.includes(':3000') || (t.title && t.title.includes('Lumière'))));
          if (lumiereTab && lumiereTab.url) {
            try {
              const u = new URL(lumiereTab.url);
              if (!els.serverUrl.value || els.serverUrl.value === 'http://localhost:3000') {
                els.serverUrl.value = `${u.protocol}//${u.host}`;
              }
              const hashMatch = lumiereTab.url.match(/#([A-Z0-9]{4,8})/i);
              if (hashMatch && (!els.roomId.value || els.roomId.value.length < 4)) {
                els.roomId.value = hashMatch[1].toUpperCase();
              }
            } catch (e) {}
          }
          if (!els.roomId.value) {
            els.roomId.value = generateRandomCode();
          }
        });
      } else if (!els.roomId.value) {
        els.roomId.value = generateRandomCode();
      }
    }
  );

  // Check current state from background
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (response && response.state && response.state.connected) {
      showConnectedState(response.state);
    }
  });

  // Random room code
  els.randomRoomBtn.addEventListener('click', () => {
    els.roomId.value = generateRandomCode();
  });

  // Connect
  els.connectBtn.addEventListener('click', () => {
    const serverUrl = els.serverUrl.value.trim();
    const username = els.username.value.trim();
    const roomId = els.roomId.value.trim().toUpperCase();

    if (!serverUrl) {
      els.serverUrl.style.borderColor = '#da373c';
      return;
    }
    if (!roomId) {
      els.roomId.style.borderColor = '#da373c';
      return;
    }

    const finalUsername = username || ('Viewer ' + Math.floor(100 + Math.random() * 900));

    chrome.runtime.sendMessage({
      type: 'CONNECT',
      serverUrl,
      roomId,
      username: finalUsername
    }, (response) => {
      if (response && response.success) {
        showConnectedState({
          serverUrl,
          roomId,
          username: finalUsername,
          connected: true,
          platform: null
        });
      }
    });
  });

  // Disconnect
  els.disconnectBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'DISCONNECT' }, () => {
      showDisconnectedState();
    });
  });

  // Open Theater & WebRTC Call
  if (els.openTheaterBtn) {
    els.openTheaterBtn.addEventListener('click', () => {
      const url = activeServerUrl ? `${activeServerUrl}/#${activeRoomId}` : 'http://localhost:3000';
      chrome.tabs.create({ url });
    });
  }

  function showConnectedState(state) {
    activeServerUrl = state.serverUrl || 'http://localhost:3000';
    activeRoomId = state.roomId || '';

    els.connectForm.classList.add('hidden');
    els.connectedPanel.classList.remove('hidden');
    els.connectedRoom.textContent = state.roomId || '---';
    els.connectedUser.textContent = state.username || '---';

    let platText = state.platform ? state.platform.toUpperCase() : 'Detecting...';
    els.connectedPlatform.textContent = platText;
    els.statusDot.classList.add('connected');
    els.statusText.textContent = 'Synchronizing';
  }

  function showDisconnectedState() {
    els.connectForm.classList.remove('hidden');
    els.connectedPanel.classList.add('hidden');
    els.statusDot.classList.remove('connected');
    els.statusText.textContent = 'Disconnected';
  }
});
