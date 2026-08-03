const CACHE_PREFIX = 'lancee-shell-'
const CACHE_NAME = `${CACHE_PREFIX}v2`
const CORE_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/img/icon.png',
]

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME)
  const indexResponse = await fetch('/index.html', { cache: 'reload' })
  if (!indexResponse.ok) throw new Error('Unable to cache the application shell.')

  const html = await indexResponse.clone().text()
  const discoveredAssets = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !path.startsWith('/api/'))
  const urls = [...new Set([...CORE_SHELL, ...discoveredAssets])]

  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = url === '/index.html'
          ? indexResponse.clone()
          : await fetch(url, { cache: 'reload' })
        if (response.ok) await cache.put(url, response)
      } catch {
        // One optional asset must not prevent the rest of the shell installing.
      }
    }),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return
  }

  // Browsers request video in byte ranges. Cache Storage cannot persist 206
  // responses, so routing these requests through the cache-first handler makes
  // otherwise valid MP4 files fail to load and leaves the controls disabled.
  // Let the browser and Express handle media/range requests directly.
  if (
    request.headers.has('range') ||
    request.destination === 'video' ||
    request.destination === 'audio' ||
    /\.(?:mp4|webm|mov|m4v|mp3|wav|ogg)$/i.test(url.pathname)
  ) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME)
            await cache.put('/index.html', response.clone())
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match('/index.html')
          return cached || new Response('lancee is unavailable offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(request, response.clone())
        }
        return response
      })
    }),
  )
})

self.addEventListener('sync', (event) => {
  if (event.tag !== 'lancee-sync-ideas') return
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'SYNC_IDEA_NOTES' })
        }
      }),
  )
})
