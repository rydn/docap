/// <reference lib="webworker" />
/**
 * Service worker: offline precache of the app (incl. model + WASM) and cross-origin
 * isolation. GitHub Pages can't send COOP/COEP headers, but every response that passes
 * through here gets them, which unlocks SharedArrayBuffer → multi-threaded inference.
 */
import { cleanupOutdatedCaches, matchPrecache, precache } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precache(self.__WB_MANIFEST)

self.addEventListener('install', () => void self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

function isolate(res: Response): Response {
  if (res.type === 'opaque' || res.status === 0) return res
  const headers = new Headers(res.headers)
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  event.respondWith(
    (async () => {
      let res = await matchPrecache(req.url)
      if (!res && req.mode === 'navigate') res = await matchPrecache(new URL('index.html', self.registration.scope).href)
      res ??= await fetch(req)
      return isolate(res)
    })(),
  )
})
