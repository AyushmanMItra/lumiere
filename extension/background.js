// ==========================================================================
// Lumiere Extension - Background Service Worker
// Manages connections between popup, content scripts, and Lumiere server
// ==========================================================================

let connectionState = {
  serverUrl: null,
  roomId: null,
  username: null,
  connected: false,
  tabId: null,
  platform: null
};

const SUPPORTED_MATCH_PATTERNS = [
  'https://*.netflix.com/*',
  'https://netflix.com/*',
  'https://*.primevideo.com/*',
  'https://primevideo.com/*',
  'https://*.amazon.com/gp/video/*',
  'https://*.amazon.com/*/video/*',
  'https://amazon.com/gp/video/*',
  'https://amazon.com/*/video/*',
  'https://*.hotstar.com/*',
  'https://hotstar.com/*',
  'https://*.jiohotstar.com/*',
  'https://jiohotstar.com/*',
  'https://*.zee5.com/*',
  'https://zee5.com/*',
  'https://*.disneyplus.com/*',
  'https://disneyplus.com/*',
  'https://*.sonyliv.com/*',
  'https://sonyliv.com/*',
  'https://*.crunchyroll.com/*',
  'https://crunchyroll.com/*'
];

function updateExtensionBadge(text, color) {
  try {
    if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color });
    }
  } catch (e) {}
}

function broadcastToContentScripts(message) {
  chrome.tabs.query({
    url: SUPPORTED_MATCH_PATTERNS
  }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  });
}

// Restore state from chrome.storage.local immediately
function restoreState() {
  chrome.storage.local.get(
    ['lumiere_serverUrl', 'lumiere_roomId', 'lumiere_username', 'lumiere_connected'],
    (data) => {
      if (data.lumiere_serverUrl) connectionState.serverUrl = data.lumiere_serverUrl;
      if (data.lumiere_username) connectionState.username = data.lumiere_username;
      if (data.lumiere_roomId) connectionState.roomId = data.lumiere_roomId;
      if (data.lumiere_connected) {
        connectionState.connected = true;
        updateExtensionBadge('ON', '#57F287');
      } else {
        updateExtensionBadge('', '#000000');
      }
    }
  );
}

restoreState();

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_STATE':
      sendResponse({ state: connectionState });
      return true;

    case 'CONNECT': {
      const { serverUrl, roomId, username } = message;
      connectionState.serverUrl = serverUrl;
      connectionState.roomId = roomId;
      connectionState.username = username;
      connectionState.connected = true;

      // Store for persistence across service worker termination
      chrome.storage.local.set({
        lumiere_serverUrl: serverUrl,
        lumiere_roomId: roomId,
        lumiere_username: username,
        lumiere_connected: true
      });

      // Update badge
      updateExtensionBadge('ON', '#57F287');

      // Notify active content script tabs
      broadcastToContentScripts({
        type: 'CONNECT_TO_SERVER',
        serverUrl,
        roomId,
        username
      });

      sendResponse({ success: true });
      return true;
    }

    case 'DISCONNECT': {
      broadcastToContentScripts({ type: 'DISCONNECT_FROM_SERVER' });
      connectionState.connected = false;
      connectionState.roomId = null;
      connectionState.tabId = null;
      connectionState.platform = null;

      chrome.storage.local.set({
        lumiere_connected: false
      });

      updateExtensionBadge('', '#000000');
      sendResponse({ success: true });
      return true;
    }

    case 'CONTENT_SCRIPT_READY': {
      connectionState.tabId = sender.tab?.id || null;
      connectionState.platform = message.platform || null;

      // Check storage in case background service worker was just restarted
      chrome.storage.local.get(
        ['lumiere_serverUrl', 'lumiere_roomId', 'lumiere_username', 'lumiere_connected'],
        (data) => {
          const isConn = connectionState.connected || Boolean(data.lumiere_connected);
          const sUrl = connectionState.serverUrl || data.lumiere_serverUrl;
          const rId = connectionState.roomId || data.lumiere_roomId;
          const uName = connectionState.username || data.lumiere_username;

          if (isConn && sUrl && sender.tab?.id) {
            connectionState.connected = true;
            connectionState.serverUrl = sUrl;
            connectionState.roomId = rId;
            connectionState.username = uName;
            updateExtensionBadge('ON', '#57F287');

            chrome.tabs.sendMessage(sender.tab.id, {
              type: 'CONNECT_TO_SERVER',
              serverUrl: sUrl,
              roomId: rId,
              username: uName
            }).catch(() => {});
          }
          sendResponse({ state: connectionState });
        }
      );
      return true;
    }

    case 'SYNC_STATE_UPDATE': {
      connectionState.platform = message.platform || connectionState.platform;
      sendResponse({ success: true });
      return true;
    }

    case 'SEND_CHAT': {
      broadcastToContentScripts({
        type: 'SEND_CHAT_MESSAGE',
        text: message.text
      });
      sendResponse({ success: true });
      return true;
    }

    default:
      sendResponse({ error: 'Unknown message type' });
      return true;
  }
});

// When a tab is navigated or reloaded on a supported streaming platform, auto-reconnect if party is active
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    chrome.storage.local.get(['lumiere_connected', 'lumiere_serverUrl', 'lumiere_roomId', 'lumiere_username'], (data) => {
      const isConn = connectionState.connected || Boolean(data.lumiere_connected);
      const sUrl = connectionState.serverUrl || data.lumiere_serverUrl;
      const rId = connectionState.roomId || data.lumiere_roomId;
      const uName = connectionState.username || data.lumiere_username;

      if (!isConn || !sUrl) return;

      const isSupported = SUPPORTED_MATCH_PATTERNS.some(pattern => {
        const regexStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
        return new RegExp(regexStr).test(tab.url);
      });

      if (isSupported) {
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, {
            type: 'CONNECT_TO_SERVER',
            serverUrl: sUrl,
            roomId: rId,
            username: uName
          }).catch(() => {});
        }, 1000);
      }
    });
  }
});
