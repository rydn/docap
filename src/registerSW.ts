import { registerSW } from 'virtual:pwa-register'

const RELOAD_KEY = 'docap:isolation-reload'

/**
 * Registers the service worker. The first time it takes control of a page that isn't
 * cross-origin isolated yet, reload once so the page (and its workers) are served with
 * the COOP/COEP headers the worker adds. Guarded so a browser that refuses isolation
 * never loops.
 */
export function setupServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (self.crossOriginIsolated) return
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) return
      sessionStorage.setItem(RELOAD_KEY, '1')
    } catch {
      return
    }
    location.reload()
  })
  registerSW({ immediate: true })
}
