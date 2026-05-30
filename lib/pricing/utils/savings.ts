/**
 * GOODPRICE Pricing — Savings Calculations
 *
 * Computes discount percentages, savings amounts, and buy-signal strength
 * for display in product cards, comparison tables, and alert triggers.
 *
 * Naming conventions:
 *   savingsVs*    — comparison against a reference price
 *   discount*     — comparison against the same product's oldPrice/was-price
 *   savings*      — absolute or percentage amount saved
 *
 * All functions are pure: no state, no side effects, no I/O.
 * All monetary inputs/outputs are in USD unless otherwise noted.
 */

import type { RetailerOffer, ProductPriceStats } from '../types'

// ── Core percentage helpers ───────────────────────────────────────────────────

/**
 * Calculate savings percentage: how much cheaper is newPrice vs referencePrice?
 *
 * @param newPrice       - Current/new price (lower)
 * @param referencePrice - Original/comparison price (higher)
 * @returns Savings percentage 0–100, or 0 if prices are equal/invalid
 *
 * @example
 * savingsPercent(79.99, 99.99) → 20  // "20% off"
 */
export function savingsPercent(newPrice: number, referencePrice: number): number {
  if (!isFinite(newPrice) || !isFinite(referencePrice)) return 0
  if (referencePrice <= 0) return 0
  if (newPrice >= referencePrice) return 0
  return Math.round(((referencePrice - newPrice) / referencePrice) * 100)
}

/**
 * Calculate absolute savings amount: referencePrice - newPrice.
 *
 * @returns Savings amount in USD (always ≥ 0)
 */
export function savingsAmount(newPrice: number, referencePrice: number): number {
  if (!isFinite(newPrice) || !isFinite(referencePrice)) return 0
  return Math.max(0, referencePrice - newPrice)
}

// ── Offer-level savings ───────────────────────────────────────────────────────

/**
 * Calculate the discount from a retailer's own "was/now" pricing.
 * Uses offer.oldPrice as the reference.
 *
 * @returns Discount percentage 0–100, or 0 if no oldPrice
 */
export function offerDiscountPercent(offer: RetailerOffer): number {
  if (!offer.oldPrice) return 0
  return savingsPercent(offer.priceUSD, offer.oldPrice)
}

/**
 * Calculate the discount amount from a retailer's own "was/now" pricing.
 *
 * @returns Savings amount in USD, or 0 if no oldPrice
 */
export function offerDiscountAmount(offer: RetailerOffer): number {
  if (!offer.oldPrice) return 0
  return savingsAmount(offer.priceUSD, offer.oldPrice)
}

/**
 * Compute the total savings vs buying locally in Colombia.
 * Compares the Amazon landed cost to an estimated local price.
 *
 * @param amazonPriceUSD     - Amazon product price
 * @param shippingUSD        - Estimated shipping cost
 * @param colombiaLocalPriceUSD - Equivalent price at a Colombian retailer
 * @returns Savings amount in USD (positive = Amazon is cheaper)
 */
export function savingsVsLocal(
  amazonPriceUSD: number,
  shippingUSD: number,
  colombiaLocalPriceUSD: number,
): number {
  const landedCost = amazonPriceUSD + shippingUSD
  return Math.max(0, colombiaLocalPriceUSD - landedCost)
}

// ── Historical savings signals ────────────────────────────────────────────────

/**
 * Calculate how much cheaper the current price is vs the all-time high.
 * Useful for "X% off all-time high" badges.
 *
 * @param stats - Computed price statistics for the product
 * @returns Savings percentage vs all-time high
 */
export function savingsVsAllTimeHigh(stats: ProductPriceStats): number {
  return savingsPercent(stats.currentBestPriceUSD, stats.allTimeHighestUSD)
}

/**
 * Calculate how much cheaper the current price is vs the 90-day average.
 * A strong buy signal when this is > 15%.
 *
 * @param stats - Computed price statistics for the product
 * @returns Savings percentage vs 90-day average, or 0 if no avg data
 */
export function savingsVs90dAverage(stats: ProductPriceStats): number {
  if (!stats.avg90dPriceUSD) return 0
  return savingsPercent(stats.currentBestPriceUSD, stats.avg90dPriceUSD)
}

/**
 * Calculate how close the current price is to the all-time low.
 * Returns a proximity percentage: 0% = at ATL, 100% = far from ATL.
 *
 * @param currentPrice  - Current best price in USD
 * @param allTimeLow    - Historical lowest price in USD
 * @returns Proximity percentage (0 = at ATL, higher = further from ATL)
 */
export function priceProximityToATL(currentPrice: number, allTimeLow: number): number {
  if (!isFinite(currentPrice) || !isFinite(allTimeLow) || allTimeLow <= 0) return 100
  if (currentPrice <= allTimeLow) return 0
  return Math.min(100, Math.round(((currentPrice - allTimeLow) / allTimeLow) * 100))
}

// ── Buy signal engine ─────────────────────────────────────────────────────────

/**
 * Buy signal thresholds — tuneable based on observed data.
 * Phase N+3: move these to a config table in the database for A/B testing.
 */
const BUY_SIGNAL_THRESHOLDS = {
  /** Savings vs 90d avg that triggers a 'strong' buy signal */
  strongSavingsPct: 20,
  /** Savings vs 90d avg that triggers a 'moderate' buy signal */
  moderateSavingsPct: 10,
  /** How close to ATL (%) counts as "near ATL" for 'strong' signal */
  nearATLProximityPct: 5,
  /** How close to ATL (%) counts as "near ATL" for 'moderate' signal */
  moderateATLProximityPct: 15,
} as const

/**
 * Compute a buy signal based on price position vs historical data.
 *
 * Signal levels:
 *   'strong'   — price at or near all-time low, OR > 20% below 90d average
 *   'moderate' — price meaningfully below average but not at ATL
 *   'neutral'  — price near the average (within ±10%)
 *   'wait'     — price above the 90d average (trending up, not a good time)
 *
 * @param stats - Computed price statistics for the product
 * @returns Buy signal strength
 */
export function computeBuySignal(
  stats: ProductPriceStats,
): ProductPriceStats['buySignal'] {
  const proximityToATL = priceProximityToATL(
    stats.currentBestPriceUSD,
    stats.allTimeLowestUSD,
  )

  const savingsVsAvg = savingsVs90dAverage(stats)

  // Strong: at or near all-time low, OR very cheap vs historical average
  if (
    proximityToATL <= BUY_SIGNAL_THRESHOLDS.nearATLProximityPct ||
    savingsVsAvg >= BUY_SIGNAL_THRESHOLDS.strongSavingsPct
  ) {
    return 'strong'
  }

  // Moderate: meaningfully cheaper than average but not at ATL
  if (
    proximityToATL <= BUY_SIGNAL_THRESHOLDS.moderateATLProximityPct ||
    savingsVsAvg >= BUY_SIGNAL_THRESHOLDS.moderateSavingsPct
  ) {
    return 'moderate'
  }

  // Wait: current price is above the 90-day average (rising trend)
  if (stats.avg90dPriceUSD && stats.currentBestPriceUSD > stats.avg90dPriceUSD) {
    return 'wait'
  }

  return 'neutral'
}

// ── Best offer selection ──────────────────────────────────────────────────────

/**
 * Select the best offer from a set of retailer offers.
 * "Best" = lowest total landed cost in Colombia.
 *
 * Landed cost = priceUSD + shippingCostEstimateUSD (defaults to 0 for local).
 *
 * @param offers - Array of offers from different retailers
 * @returns The offer with the lowest total landed cost, or null if empty
 */
export function selectBestOffer(offers: RetailerOffer[]): RetailerOffer | null {
  const available = offers.filter(o =>
    o.availability === 'in_stock' || o.availability === 'limited',
  )
  if (available.length === 0) return null

  return available.reduce((best, current) => {
    const bestLanded    = best.totalLandedCostUSD    ?? best.priceUSD    + (best.shippingCostEstimateUSD    ?? 0)
    const currentLanded = current.totalLandedCostUSD ?? current.priceUSD + (current.shippingCostEstimateUSD ?? 0)
    return currentLanded < bestLanded ? current : best
  })
}

/**
 * Find the second-best offer (used for comparison in "vs best" displays).
 *
 * @param offers     - Array of all offers
 * @param bestOffer  - The already-identified best offer (will be excluded)
 * @returns The next-best offer, or null if only one offer exists
 */
export function selectRunnerUpOffer(
  offers: RetailerOffer[],
  bestOffer: RetailerOffer,
): RetailerOffer | null {
  const others = offers.filter(o => o.retailerId !== bestOffer.retailerId)
  return selectBestOffer(others)
}

// ── Display helpers ───────────────────────────────────────────────────────────

/**
 * Generate a savings badge label string.
 * Output: "-20%", "ATL", "Oferta"
 *
 * @param discountPct   - Discount percentage vs reference (0–100)
 * @param isAllTimeLow  - Whether this is the all-time lowest price
 */
export function savingsBadgeLabel(discountPct: number, isAllTimeLow: boolean): string {
  if (isAllTimeLow) return 'Mínimo histórico'
  if (discountPct >= 30) return `-${discountPct}%`
  if (discountPct >= 10) return `-${discountPct}%`
  if (discountPct > 0)   return 'Oferta'
  return ''
}
