// Loop PWA background app-shell management. Do not delete browser storage.
const CACHE_NAME = 'loop-alpha-v27';
const APP_SHELL = [
  '/',
  '/index.html',
  '/brain/loop-guide.js',
  '/community/communities-v1.css',
  '/community/communities-v1.js',
  '/updates/auto-update.js',
  '/manifest.webmanifest',
  '/games/',
  '/games/index.html',
  '/games/snake.html',
  '/games/space-impact.html',
  '/games/arcade-common.js',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // First-time installs become active immediately; upgrades wait until the
    // open app chooses a safe moment or its previous tabs have closed.
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'LOOP_APPLY_UPDATE') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('loop-alpha-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function putInCache(event, cacheKey, response) {
  if (!response.ok || response.type === 'opaque') return;
  const copy = response.clone();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, copy)).catch(() => {}));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Dynamic APIs are always live: do not cache places, profiles or release info.
  if (url.pathname.startsWith('/api/')) return;

  const isPage = request.mode === 'navigate';
  const isCode = /^\/(?:brain\/|updates\/|community\/)/.test(url.pathname) ||
    url.pathname === '/manifest.webmanifest';
  if (isPage || isCode) {
    event.respondWith((async () => {
      const cacheKey = isPage ? url.pathname : request;
      try {
        const response = await fetch(request, { cache: 'no-store' });
        putInCache(event, cacheKey, response);
        return response;
      } catch {
        return (await caches.match(cacheKey)) ||
          (isPage ? (url.pathname.startsWith('/games/')
            ? await caches.match('/games/index.html')
            : await caches.match('/index.html')) : Response.error());
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    putInCache(event, request, response);
    return response;
  })());
});
