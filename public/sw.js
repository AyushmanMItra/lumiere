// Lumière PWA Service Worker for Standalone Display
const CACHE_NAME = 'lumiere-standalone-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through network requests for real-time WebRTC, sockets, and video streams
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});