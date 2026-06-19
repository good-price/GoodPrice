/**
 * lib/catalog/discovery/amazon/scraper.ts
 *
 * Amazon HTTP scraper — Sprint 4A.
 *
 * Fetches a DiscoverySource URL with:
 *   - Desktop Chrome user-agent and realistic headers
 *   - 15 000 ms timeout via AbortController
 *   - Up to 3 retries with exponential back-off
 *   - Graceful handling of 429 / 503 / CAPTCHA responses
 *
 * Never throws. Returns a ScrapeResult in all cases.
 *
 * SERVER-ONLY.
 */

import type { DiscoverySource, ScrapeResult } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMEOUT_MS  = 15_000
const MAX_RETRIES = 3

const CHROME_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,' +
    'image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT':             '1',
  'Connection':      'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest':  'document',
  'Sec-Fetch-Mode':  'navigate',
  'Sec-Fetch-Site':  'none',
  'Sec-Fetch-User':  '?1',
  'Cache-Control':   'max-age=0',
}

// ── Bot-detection heuristics ──────────────────────────────────────────────────

function isBlocked(html: string): boolean {
  if (html.length < 3_000) return true
  const lower = html.toLowerCase()
  return (
    lower.includes('to discuss automated access') ||
    lower.includes('robot check') ||
    lower.includes('enter the characters you see below') ||
    lower.includes('type the characters you see in this image') ||
    lower.includes('verify you are a human') ||
    lower.includes('/errors/validateCaptcha')
  )
}

// ── Private: single attempt ───────────────────────────────────────────────────

async function attemptFetch(url: string): Promise<{ html: string; status: number }> {
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: CHROME_HEADERS,
      redirect: 'follow',
      signal:   controller.signal,
    })
    const html = await response.text()
    return { html, status: response.status }
  } finally {
    clearTimeout(timer)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches a single Amazon discovery source.
 *
 * Retries up to MAX_RETRIES times with exponential back-off (1s, 2s, 4s).
 * Returns success=false for blocked pages, network errors, and HTTP errors.
 * Never throws.
 */
export async function fetchDiscoverySource(source: DiscoverySource): Promise<ScrapeResult> {
  const t0 = Date.now()

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1_000 * Math.pow(2, attempt - 1)))
    }

    try {
      const { html, status } = await attemptFetch(source.url)

      // Hard failures — don't retry
      if (status === 429) {
        return {
          success:    false,
          html:       '',
          status,
          durationMs: Date.now() - t0,
          source,
          error:      'Rate limited (429)',
        }
      }

      if (status >= 400) {
        if (attempt < MAX_RETRIES - 1) continue
        return {
          success:    false,
          html:       '',
          status,
          durationMs: Date.now() - t0,
          source,
          error:      `HTTP ${status}`,
        }
      }

      if (isBlocked(html)) {
        return {
          success:    false,
          html:       '',
          status,
          durationMs: Date.now() - t0,
          source,
          error:      'Blocked / CAPTCHA detected',
        }
      }

      return {
        success:    true,
        html,
        status,
        durationMs: Date.now() - t0,
        source,
      }

    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      if (attempt < MAX_RETRIES - 1 && !isTimeout) continue
      return {
        success:    false,
        html:       '',
        status:     0,
        durationMs: Date.now() - t0,
        source,
        error:      isTimeout
          ? `Timeout after ${TIMEOUT_MS}ms`
          : (err instanceof Error ? err.message : String(err)),
      }
    }
  }

  return {
    success:    false,
    html:       '',
    status:     0,
    durationMs: Date.now() - t0,
    source,
    error:      'All retries exhausted',
  }
}
