/**
 * Page views, and nothing else. Google Analytics loads only when a measurement id is set at build
 * time (VITE_GA_ID) and the app is not running on localhost, so development and anyone building
 * from source stay untracked. The app's own data never leaves the browser either way.
 */
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const LOCAL = new Set(['localhost', '127.0.0.1', '::1', ''])

export function startAnalytics() {
  const id = import.meta.env.VITE_GA_ID
  if (!id || LOCAL.has(location.hostname)) return

  const tag = document.createElement('script')
  tag.async = true
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(tag)

  window.dataLayer = window.dataLayer ?? []
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args)
  }
  window.gtag('js', new Date())
  // One page view per visit: the app is a single page and sends nothing else.
  window.gtag('config', id)
}
