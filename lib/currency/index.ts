/**
 * lib/currency/index.ts
 *
 * Public API for the GOODPRICE currency system.
 *
 * Server-component usage (the common case):
 *   import { buildCopPriceMap, getCachedRate } from '@/lib/currency'
 *   const copPrices = buildCopPriceMap(products)
 *   <ProductGrid products={products} copPrices={copPrices} />
 *
 * Admin / API route usage:
 *   import { updateExchangeRate, getRateMeta } from '@/lib/currency'
 *   const result = await updateExchangeRate()
 */

// ── Types ──────────────────────────────────────────────────────────────────────
export type { StoredRate, RateProvider, RateFetchResult, FormattedPrice } from './types'

// ── Cache (sync, server-side) ─────────────────────────────────────────────────
export { getCachedRate, getRateMeta, FALLBACK_RATE, DISK_TTL_HOURS } from './cache'

// ── Formatter (sync, server-side) ─────────────────────────────────────────────
export { formatCOP, formatUSD, convertUSDtoCOP, priceFor, buildCopPriceMap } from './formatter'

// ── Exchange service (async, cron/admin only) ─────────────────────────────────
export { updateExchangeRate, getStoredRateInfo } from './exchange-service'
export type { UpdateRateResult } from './exchange-service'
