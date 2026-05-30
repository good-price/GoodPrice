/**
 * lib/currency/types.ts
 *
 * Shared types for the GOODPRICE currency system.
 *
 * Architecture:
 *   - Rates are fetched server-side once daily (3 AM Colombia time / 8 AM UTC)
 *   - Cached to disk at data/currency/usd-cop.json
 *   - Read synchronously in server components via getCachedRate()
 *   - Product prices are formatted server-side and passed as strings to client components
 *   - Zero client-side currency fetches — all conversions happen at render time
 */

// ── Stored rate ────────────────────────────────────────────────────────────────

/** The structure written to data/currency/usd-cop.json */
export interface StoredRate {
  /** How many COP equal 1 USD (e.g. 4125.50) */
  rate:       number
  /** Which provider supplied this rate */
  source:     RateProvider
  /** ISO timestamp when this rate was fetched */
  fetchedAt:  string
  /** ISO timestamp when this rate should be refreshed */
  expiresAt:  string
}

// ── Provider identity ──────────────────────────────────────────────────────────

export type RateProvider =
  | 'exchangerate.host'
  | 'open.er-api'
  | 'frankfurter.app'
  | 'wise'
  | 'hardcoded-fallback'

// ── Fetch result ───────────────────────────────────────────────────────────────

export type RateFetchResult =
  | { ok: true;  rate: number; source: RateProvider }
  | { ok: false; error: string; source: RateProvider }

// ── Formatted price pair ───────────────────────────────────────────────────────

/**
 * A price formatted in both currencies, ready to render.
 * Computed server-side and passed as props to client components.
 */
export interface FormattedPrice {
  /** Primary display: "$ 1.029.000" */
  cop:    string
  /** Secondary reference: "USD $279.99" */
  usd:    string
  /** Raw COP amount (for aria-label / sorting) */
  copRaw: number
}
