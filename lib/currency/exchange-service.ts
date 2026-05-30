/**
 * lib/currency/exchange-service.ts
 *
 * Orchestrates the provider fallback chain and persists the result to disk.
 *
 * Fallback order:
 *   1. exchangerate.host
 *   2. open.er-api.com
 *   3. frankfurter.app
 *   4. Wise page parsing
 *   5. Existing disk cache (stale but better than nothing)
 *   6. FALLBACK_RATE (hardcoded 4100)
 *
 * This function is called by POST /api/currency/update (cron + admin button).
 * It is intentionally async — it hits external APIs — and should NOT be called
 * during page renders. Use getCachedRate() from cache.ts for rendering.
 */

import {
  fetchFromExchangeRateHost,
  fetchFromOpenErApi,
  fetchFromFrankfurter,
  fetchFromWise,
} from './providers'
import { writeStoredRate, readStoredRate, FALLBACK_RATE } from './cache'
import type { StoredRate } from './types'

export interface UpdateRateResult {
  ok:      boolean
  rate:    number
  source:  string
  error?:  string
  /** True if the result came from an existing disk cache (no new fetch succeeded) */
  stale?:  boolean
}

/**
 * Fetches the current USD→COP rate from external providers, tries each in order,
 * writes the first successful result to disk, and returns the result.
 *
 * Designed to be called once per day by a cron job at 3 AM Colombia time (8 AM UTC).
 */
export async function updateExchangeRate(): Promise<UpdateRateResult> {
  const providers = [
    fetchFromExchangeRateHost,
    fetchFromOpenErApi,
    fetchFromFrankfurter,
    fetchFromWise,
  ]

  const errors: string[] = []

  for (const provider of providers) {
    const result = await provider()
    if (result.ok) {
      writeStoredRate(result.rate, result.source)
      console.log(
        `[currency] Rate updated: 1 USD = ${result.rate} COP (source: ${result.source})`
      )
      return { ok: true, rate: result.rate, source: result.source }
    }
    errors.push(`${result.source}: ${result.error}`)
    console.warn(`[currency] Provider ${result.source} failed: ${result.error}`)
  }

  // All providers failed — try to serve the stale disk cache
  const stale = readStoredRate()
  if (stale) {
    console.warn('[currency] All providers failed. Using stale cached rate:', stale.rate)
    return {
      ok:     false,
      rate:   stale.rate,
      source: stale.source,
      error:  `All providers failed: ${errors.join(' | ')}`,
      stale:  true,
    }
  }

  // Absolute last resort — hardcoded fallback
  console.error('[currency] All providers failed and no disk cache. Using hardcoded fallback.')
  return {
    ok:     false,
    rate:   FALLBACK_RATE,
    source: 'hardcoded-fallback',
    error:  `All providers failed: ${errors.join(' | ')}`,
    stale:  false,
  }
}

/**
 * Returns the stored rate metadata for the admin dashboard.
 * If no rate is stored yet, returns the fallback with isFallback=true.
 */
export function getStoredRateInfo(): StoredRate & { isFallback: boolean } {
  const stored = readStoredRate()
  if (!stored) {
    return {
      rate:      FALLBACK_RATE,
      source:    'hardcoded-fallback',
      fetchedAt: new Date(0).toISOString(),
      expiresAt: new Date(0).toISOString(),
      isFallback: true,
    }
  }
  return { ...stored, isFallback: false }
}
