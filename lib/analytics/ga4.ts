declare global {
  interface Window {
    gtag: (
      command: 'event' | 'config' | 'js' | 'set',
      targetId: string | Date,
      params?: Record<string, unknown>,
    ) => void
    dataLayer: unknown[]
  }
}

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? ''

/**
 * Fire a GA4 custom event. No-op when:
 *   - called server-side (SSR)
 *   - GA_ID env var not set
 *   - gtag script not yet loaded (before afterInteractive fires)
 */
export function ga4Event(
  eventName: string,
  params: Record<string, string | number | boolean>,
): void {
  if (typeof window === 'undefined') return
  if (!GA_ID || typeof window.gtag !== 'function') return
  window.gtag('event', eventName, params)
}
