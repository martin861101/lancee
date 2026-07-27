export const IDEA_SYNC_REQUEST_EVENT = 'lancee:request-idea-sync'

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_IDEA_NOTES') {
      window.dispatchEvent(new Event(IDEA_SYNC_REQUEST_EVENT))
    }
  })
}
