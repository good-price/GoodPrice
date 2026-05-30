/**
 * lib/catalog/stabilization/trm-engine.ts
 *
 * TRM (Tasa Representativa del Mercado) engine for GOODPRICE.
 *
 * The TRM is Colombia's official reference exchange rate, published daily
 * by the Banco de la República. All COP prices on GOODPRICE must use:
 *
 *   price_COP = price_USD × TRM
 *
 * This module wraps the existing lib/currency system and exposes:
 *   - getTrmStatus()    — current TRM state with freshness analysis
 *   - getTrmRate()      — current rate (falls back to cached/fallback)
 *   - isTrmFresh()      — whether the rate is within acceptable window
 *
 * The TRM is considered stale after 25 hours. At that point, the system
 * should trigger a refresh via POST /api/currency/update.
 *
 * SERVER-ONLY.
 */

import { getCachedRate, getRateMeta, FALLBACK_RATE, DISK_TTL_HOURS } from '@/lib/currency/cache'
import type { TrmStatus } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

/** TRM is "fresh" for the first 8 hours after fetch (within same business day). */
const FRESH_HOURS  = 8
/** TRM is "aging" from 8h to DISK_TTL_HOURS — still valid but should refresh soon. */
const AGING_HOURS  = DISK_TTL_HOURS  // 25h

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current TRM with full freshness metadata.
 */
export function getTrmStatus(): TrmStatus {
  const meta   = getRateMeta()
  const now    = Date.now()

  let ageHours = 0
  let fetchedAt: string | null = null
  let expiresAt: string | null = null

  if (meta.fetchedAt) {
    fetchedAt = meta.fetchedAt
    ageHours  = (now - new Date(meta.fetchedAt).getTime()) / 3_600_000
  }
  if (meta.expiresAt) {
    expiresAt = meta.expiresAt
  }

  const isFallback = meta.isFallback
  const isStale    = meta.isExpired || isFallback

  let freshnessLabel: TrmStatus['freshnessLabel']
  if (isFallback || !fetchedAt) {
    freshnessLabel = 'unknown'
  } else if (ageHours <= FRESH_HOURS) {
    freshnessLabel = 'fresh'
  } else if (ageHours <= AGING_HOURS) {
    freshnessLabel = 'aging'
  } else {
    freshnessLabel = 'stale'
  }

  return {
    rate:   meta.rate,
    source: meta.source,
    fetchedAt,
    expiresAt,
    ageHours: Math.round(ageHours * 10) / 10,
    isStale,
    isFallback,
    freshnessLabel,
  }
}

/**
 * Returns the current TRM rate (USD→COP).
 * Falls back to 4100 if no rate is available.
 */
export function getTrmRate(): number {
  return getCachedRate()
}

/**
 * Returns true if the TRM is fresh enough for pricing display.
 * Products should show a "precio en actualización" badge when TRM is stale.
 */
export function isTrmFresh(): boolean {
  const meta = getRateMeta()
  return !meta.isExpired && !meta.isFallback
}

/**
 * Converts a USD price to COP using the current TRM.
 * Uses fallback rate if TRM is unavailable.
 */
export function convertUsdToCop(usd: number): number {
  const rate = getTrmRate()
  return Math.round(usd * rate)
}

/**
 * Returns the TRM health score (0–100).
 * Used in the catalog health composite score.
 */
export function computeTrmHealth(): number {
  const status = getTrmStatus()
  if (status.freshnessLabel === 'fresh')   return 100
  if (status.freshnessLabel === 'aging')   return 70
  if (status.freshnessLabel === 'stale')   return 20
  if (status.isFallback)                   return 0
  return 50
}

/**
 * Returns the fallback rate constant (for reference).
 */
export { FALLBACK_RATE as TRM_FALLBACK_RATE }
