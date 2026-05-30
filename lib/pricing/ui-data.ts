/**
 * GOODPRICE Pricing — Display-Ready Data Loader
 *
 * Server-side only. Fetches pricing data from the store and
 * computes all display signals needed by UI components.
 *
 * Called from Server Components and page.tsx files only.
 * Returns null (graceful degradation) when no pricing data is available —
 * UI components should render nothing in that case.
 *
 * Data flow:
 *   FileStore → raw offers + snapshots
 *   → ui-data.ts computes display signals
 *   → PriceComparisonPanel renders
 */

import type { RetailerOffer, PriceHistoryPoint, PriceTrend } from './types'
import { getPricingStore } from './store'
import { detectTrend } from './utils/trends'
import { pricePositionInRange, pricePositionLabel } from './utils/comparison'
import { isNearAllTimeLow } from './utils/trends'

// ── Display types ─────────────────────────────────────────────────────────────

export interface HistoryStats {
  /** Number of daily data points available */
  dayCount:   number
  minUSD:     number
  maxUSD:     number
  avgUSD:     number
  /** Current price position in range: 0.0 (at low) → 1.0 (at high) */
  position:   number
  /** Human-readable label for the position */
  positionLabel: string
  /** Whether current price is near all-time low (within 5%) */
  nearATL:    boolean
  trend:      PriceTrend
}

export interface ProductPricingUIData {
  /** ML offer (mercadolibre), null if not yet fetched */
  mlOffer:     RetailerOffer | null
  /** All offers for this product */
  allOffers:   RetailerOffer[]
  /** Last time any offer was checked (ISO string) or null */
  lastCheckedAt: string | null
  /** Computed history stats (null if < 3 data points) */
  historyStats: HistoryStats | null
}

// ── Buy signal ────────────────────────────────────────────────────────────────

/**
 * Compute a human-readable buy signal from history stats and trend.
 * Returns null if there's not enough data to make a recommendation.
 */
export function computeDisplayBuySignal(
  stats: HistoryStats | null,
): 'strong_buy' | 'good_buy' | 'neutral' | 'wait' | null {
  if (!stats || stats.dayCount < 7) return null

  // Near all-time low = strong buy
  if (stats.nearATL) return 'strong_buy'
  // Bottom 25% of range + falling = good buy
  if (stats.position <= 0.25 && stats.trend === 'falling') return 'good_buy'
  // Bottom 35% of range = good buy
  if (stats.position <= 0.35) return 'good_buy'
  // Top 75% + rising = wait
  if (stats.position >= 0.75 && stats.trend === 'rising') return 'wait'
  // Top 60% = wait
  if (stats.position >= 0.60) return 'wait'

  return 'neutral'
}

// ── Relative time ─────────────────────────────────────────────────────────────

/** Format an ISO timestamp as a relative "hace X" string (Spanish) */
export function relativeTime(isoString: string): string {
  const now    = Date.now()
  const then   = new Date(isoString).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 2)  return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24)   return hours === 1 ? 'hace 1 hora' : `hace ${hours} horas`

  const days = Math.floor(hours / 24)
  return days === 1 ? 'hace 1 día' : `hace ${days} días`
}

// ── Main loader ───────────────────────────────────────────────────────────────

/**
 * Load display-ready pricing data for a catalog product.
 *
 * @param productId - Internal catalog product ID (e.g. "elec-001")
 * @returns Pricing UI data, or null if nothing is available yet
 */
export async function getProductPricingUIData(
  productId: string,
): Promise<ProductPricingUIData | null> {
  try {
    const store = getPricingStore()

    const [allOffers, history] = await Promise.all([
      store.getOffers(productId),
      store.getPriceHistory(productId, 30),
    ])

    // No data at all → return null (component renders nothing)
    if (allOffers.length === 0) return null

    const mlOffer = allOffers.find(o => o.retailerId === 'mercadolibre') ?? null

    // Most recent check timestamp across all offers
    const lastCheckedAt = allOffers
      .map(o => o.lastCheckedAt)
      .sort()
      .pop() ?? null

    // History stats
    const historyStats = computeHistoryStats(history, mlOffer?.priceUSD ?? 0)

    return {
      mlOffer,
      allOffers,
      lastCheckedAt,
      historyStats,
    }
  } catch {
    // Store unavailable or file not found — degrade silently
    return null
  }
}

// ── History stat computation ──────────────────────────────────────────────────

function computeHistoryStats(
  history: PriceHistoryPoint[],
  currentPriceUSD: number,
): HistoryStats | null {
  if (history.length < 3) return null

  const allMins  = history.map(h => h.lowestPriceUSD)
  const allMaxes = history.map(h => h.highestPriceUSD)
  const allAvgs  = history.map(h => h.averagePriceUSD)

  const minUSD = Math.min(...allMins)
  const maxUSD = Math.max(...allMaxes)
  const avgUSD = Math.round(
    (allAvgs.reduce((s, v) => s + v, 0) / allAvgs.length) * 100,
  ) / 100

  const position     = pricePositionInRange(currentPriceUSD, minUSD, maxUSD)
  const positionLabel = pricePositionLabel(position)
  const trend        = detectTrend(history)
  const nearATL      = isNearAllTimeLow(currentPriceUSD, minUSD)

  return {
    dayCount: history.length,
    minUSD,
    maxUSD,
    avgUSD,
    position,
    positionLabel,
    nearATL,
    trend,
  }
}
