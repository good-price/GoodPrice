/**
 * lib/currency/providers.ts
 *
 * Exchange-rate provider implementations.
 *
 * Three providers are tried in order:
 *   1. exchangerate.host  — primary (free, no key, fast)
 *   2. open.er-api.com    — secondary (free tier, ECB + commercial data)
 *   3. frankfurter.app    — tertiary (ECB reference rates, highly reliable)
 *
 * A fourth "Wise page parsing" strategy is also included as a last resort.
 * All providers return a RateFetchResult — callers never throw.
 *
 * Timeout: 5 seconds per provider (ISR pages are server-rendered; a slow
 * currency fetch would block the entire page render).
 */

import type { RateFetchResult } from './types'

// ── Helpers ────────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 5_000

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ── Provider 1 — exchangerate.host ────────────────────────────────────────────

/**
 * https://api.exchangerate.host/live?source=USD&currencies=COP
 * Response: { success: true, quotes: { USDCOP: 4125.50 } }
 */
export async function fetchFromExchangeRateHost(): Promise<RateFetchResult> {
  const source = 'exchangerate.host' as const
  try {
    const res = await fetchWithTimeout(
      'https://api.exchangerate.host/live?source=USD&currencies=COP',
      { cache: 'no-store' },
    )
    if (!res.ok) return { ok: false, source, error: `HTTP ${res.status}` }

    const data = await res.json() as {
      success?: boolean
      quotes?:  Record<string, number>
    }
    const rate = data?.quotes?.USDCOP
    if (typeof rate !== 'number' || rate <= 0) {
      return { ok: false, source, error: 'Invalid rate in response' }
    }
    return { ok: true, source, rate }
  } catch (err) {
    return { ok: false, source, error: String(err) }
  }
}

// ── Provider 2 — open.er-api.com ─────────────────────────────────────────────

/**
 * https://open.er-api.com/v6/latest/USD
 * Response: { result: "success", rates: { COP: 4125.50 } }
 */
export async function fetchFromOpenErApi(): Promise<RateFetchResult> {
  const source = 'open.er-api' as const
  try {
    const res = await fetchWithTimeout(
      'https://open.er-api.com/v6/latest/USD',
      { cache: 'no-store' },
    )
    if (!res.ok) return { ok: false, source, error: `HTTP ${res.status}` }

    const data = await res.json() as {
      result?: string
      rates?:  Record<string, number>
    }
    const rate = data?.rates?.COP
    if (typeof rate !== 'number' || rate <= 0) {
      return { ok: false, source, error: 'Invalid rate in response' }
    }
    return { ok: true, source, rate }
  } catch (err) {
    return { ok: false, source, error: String(err) }
  }
}

// ── Provider 3 — frankfurter.app (ECB reference rates) ───────────────────────

/**
 * https://api.frankfurter.app/latest?from=USD&to=COP
 * Response: { rates: { COP: 4125.50 } }
 *
 * Note: ECB reference rates are updated once daily at ~16:00 CET.
 * They differ slightly from mid-market rates but are highly reliable.
 */
export async function fetchFromFrankfurter(): Promise<RateFetchResult> {
  const source = 'frankfurter.app' as const
  try {
    const res = await fetchWithTimeout(
      'https://api.frankfurter.app/latest?from=USD&to=COP',
      { cache: 'no-store' },
    )
    if (!res.ok) return { ok: false, source, error: `HTTP ${res.status}` }

    const data = await res.json() as {
      rates?: Record<string, number>
    }
    const rate = data?.rates?.COP
    if (typeof rate !== 'number' || rate <= 0) {
      return { ok: false, source, error: 'Invalid rate in response' }
    }
    return { ok: true, source, rate }
  } catch (err) {
    return { ok: false, source, error: String(err) }
  }
}

// ── Provider 4 — Wise page parsing (last resort) ──────────────────────────────

/**
 * Fetches the Wise currency converter page and extracts the USD→COP rate
 * by parsing embedded JSON. This is fragile by nature — only used when
 * all API providers have failed.
 *
 * Target: https://wise.com/gb/currency-converter/usd-to-cop-rate
 * Pattern: looks for "exchangeRate" or "rate" numeric values in the HTML.
 */
export async function fetchFromWise(): Promise<RateFetchResult> {
  const source = 'wise' as const
  try {
    const res = await fetchWithTimeout(
      'https://wise.com/gb/currency-converter/usd-to-cop-rate',
      {
        cache: 'no-store',
        headers: {
          // Mimic a browser to avoid bot detection
          'User-Agent': 'Mozilla/5.0 (compatible; GOODPRICE-rate-bot/1.0)',
          'Accept':     'text/html,application/xhtml+xml',
        },
      },
    )
    if (!res.ok) return { ok: false, source, error: `HTTP ${res.status}` }

    const html = await res.text()

    // Pattern 1: "exchangeRate":4126.12
    const m1 = html.match(/"exchangeRate"\s*:\s*(\d{3,5}(?:\.\d+)?)/)
    if (m1) {
      const rate = parseFloat(m1[1])
      if (rate > 0) return { ok: true, source, rate }
    }

    // Pattern 2: "rate":4126.12 (in a JSON block following "COP")
    // Capture the first occurrence of "rate": followed by a large number (COP is 3000–6000)
    const m2 = html.match(/"rate"\s*:\s*((?:3|4|5|6)\d{3}(?:\.\d+)?)/)
    if (m2) {
      const rate = parseFloat(m2[1])
      if (rate > 0) return { ok: true, source, rate }
    }

    return { ok: false, source, error: 'Rate not found in Wise page HTML' }
  } catch (err) {
    return { ok: false, source, error: String(err) }
  }
}
