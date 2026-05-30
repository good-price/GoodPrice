/**
 * GOODPRICE Pricing — Price Comparison Helpers
 *
 * Utilities for multi-retailer price comparison, offer sorting,
 * snapshot ID generation, and display-ready comparison data.
 *
 * These are the building blocks for the future "Compare prices" feature
 * where users see a product available at 3–5 retailers with landed costs.
 *
 * All functions are pure (no I/O).
 */

import type { RetailerOffer, TrackedProduct, ProductPriceStats } from '../types'
import { selectBestOffer } from './savings'

// ── Offer sorting ─────────────────────────────────────────────────────────────

/**
 * Sort offers by total landed cost in Colombia (ascending — cheapest first).
 *
 * Landed cost = price + shipping estimate.
 * Out-of-stock and discontinued offers are sorted to the end.
 *
 * @param offers - Array of retailer offers to sort
 * @returns New sorted array (original is not mutated)
 */
export function sortOffersByLandedCost(offers: RetailerOffer[]): RetailerOffer[] {
  return [...offers].sort((a, b) => {
    // Push unavailable offers to the end
    const aAvailable = a.availability === 'in_stock' || a.availability === 'limited'
    const bAvailable = b.availability === 'in_stock' || b.availability === 'limited'
    if (aAvailable !== bAvailable) return aAvailable ? -1 : 1

    const aLanded = a.totalLandedCostUSD ?? a.priceUSD + (a.shippingCostEstimateUSD ?? 0)
    const bLanded = b.totalLandedCostUSD ?? b.priceUSD + (b.shippingCostEstimateUSD ?? 0)
    return aLanded - bLanded
  })
}

/**
 * Sort offers by raw price (USD) ascending, ignoring shipping.
 * Useful for "cheapest price" sorting independent of shipping costs.
 */
export function sortOffersByPrice(offers: RetailerOffer[]): RetailerOffer[] {
  return [...offers].sort((a, b) => a.priceUSD - b.priceUSD)
}

// ── Offer comparison data ─────────────────────────────────────────────────────

/**
 * A single row in a multi-retailer price comparison table.
 * Ready for direct rendering in UI components.
 */
export interface OfferComparisonRow {
  retailerId: string
  retailerName: string
  priceUSD: number
  shippingUSD: number
  landedCostUSD: number
  availability: RetailerOffer['availability']
  affiliateUrl: string
  /** Savings vs the most expensive available offer (0 for the highest price) */
  savingsVsMaxPct: number
  /** Whether this is the best (cheapest landed cost) offer */
  isBest: boolean
  /** Whether this is the only local retailer option (no import needed) */
  isLocal: boolean
}

/**
 * Build a comparison table from a set of offers.
 * Sorted by landed cost ascending.
 *
 * @param offers        - All retailer offers for a product
 * @param retailerNames - Map of retailerId → display name
 * @param localRetailerIds - Set of retailer IDs that are local (CO) retailers
 * @returns Sorted array of comparison rows
 */
export function buildOfferComparisonTable(
  offers: RetailerOffer[],
  retailerNames: Record<string, string>,
  localRetailerIds: Set<string> = new Set(['mercadolibre', 'alkosto', 'falabella', 'exito']),
): OfferComparisonRow[] {
  const sorted = sortOffersByLandedCost(offers)
  if (sorted.length === 0) return []

  const best = sorted.find(o =>
    o.availability === 'in_stock' || o.availability === 'limited',
  )

  // Find max landed cost among available offers (for savings calculation)
  const available = sorted.filter(o =>
    o.availability === 'in_stock' || o.availability === 'limited',
  )
  const maxLanded = available.length > 0
    ? Math.max(...available.map(o =>
        o.totalLandedCostUSD ?? o.priceUSD + (o.shippingCostEstimateUSD ?? 0),
      ))
    : 0

  return sorted.map(offer => {
    const landedCost = offer.totalLandedCostUSD
      ?? offer.priceUSD + (offer.shippingCostEstimateUSD ?? 0)

    const savingsVsMaxPct = maxLanded > 0 && landedCost < maxLanded
      ? Math.round(((maxLanded - landedCost) / maxLanded) * 100)
      : 0

    return {
      retailerId:     offer.retailerId,
      retailerName:   retailerNames[offer.retailerId] ?? offer.retailerId,
      priceUSD:       offer.priceUSD,
      shippingUSD:    offer.shippingCostEstimateUSD ?? 0,
      landedCostUSD:  landedCost,
      availability:   offer.availability,
      affiliateUrl:   offer.affiliateUrl ?? offer.url,
      savingsVsMaxPct,
      isBest:         best?.retailerId === offer.retailerId,
      isLocal:        localRetailerIds.has(offer.retailerId),
    }
  })
}

// ── Price position analysis ───────────────────────────────────────────────────

/**
 * Calculate where the current price sits within a product's historical range.
 *
 * @param current - Current best price in USD
 * @param low     - All-time lowest price in USD
 * @param high    - All-time highest price in USD
 * @returns Position 0.0 (at all-time low) to 1.0 (at all-time high)
 */
export function pricePositionInRange(
  current: number,
  low: number,
  high: number,
): number {
  if (!isFinite(current) || !isFinite(low) || !isFinite(high)) return 0.5
  if (high <= low) return 0.5
  const position = (current - low) / (high - low)
  return Math.max(0, Math.min(1, position))
}

/**
 * Summarize where a price sits in its historical range as a label.
 * Used for product cards and detail pages.
 *
 * @param position - Output of pricePositionInRange (0–1)
 * @returns Spanish label for the price position
 */
export function pricePositionLabel(position: number): string {
  if (position <= 0.10) return 'Precio mínimo histórico'
  if (position <= 0.25) return 'Precio muy bajo'
  if (position <= 0.45) return 'Precio bajo'
  if (position <= 0.55) return 'Precio promedio'
  if (position <= 0.75) return 'Precio alto'
  if (position <= 0.90) return 'Precio muy alto'
  return 'Precio máximo histórico'
}

// ── Snapshot ID generation ────────────────────────────────────────────────────

/**
 * Generate a deterministic snapshot ID from retailer + product + timestamp.
 * Used by the normalizers/product.ts pipeline to create reproducible IDs
 * (allows deduplication if the same snapshot is ingested twice).
 *
 * Format: "snap_[retailerId]_[externalId]_[epochSeconds]"
 *
 * Note: not cryptographically secure — for deduplication only, not auth.
 *
 * @param retailerId  - Retailer identifier
 * @param externalId  - Retailer's product identifier
 * @param recordedAt  - ISO timestamp string
 * @returns Snapshot ID string
 */
export function generateSnapshotId(
  retailerId: string,
  externalId: string,
  recordedAt: string,
): string {
  const epochSec = Math.floor(new Date(recordedAt).getTime() / 1_000)
  return `snap_${retailerId}_${externalId}_${epochSec}`
}

// ── Cross-retailer comparison ─────────────────────────────────────────────────

/**
 * Check whether a product is currently cheaper on Amazon than all local retailers.
 *
 * @param offers         - All current offers
 * @param localIds       - Set of local retailer IDs
 * @param shippingUSD    - Amazon shipping estimate
 * @returns true if Amazon's total landed cost is below all local prices
 */
export function isAmazonCheaperThanLocal(
  offers: RetailerOffer[],
  localIds: Set<string> = new Set(['mercadolibre', 'alkosto', 'falabella', 'exito']),
  shippingUSD = 12,
): boolean {
  const amazonOffer = offers.find(o => o.retailerId === 'amazon')
  if (!amazonOffer) return false

  const localOffers = offers.filter(o => localIds.has(o.retailerId))
  if (localOffers.length === 0) return true // no local to compare

  const amazonLanded = amazonOffer.priceUSD + shippingUSD
  const cheapestLocal = Math.min(...localOffers.map(o => o.priceUSD))

  return amazonLanded < cheapestLocal
}

/**
 * Compute the average Amazon savings vs local Colombian retailers.
 *
 * @param offers         - All current offers with local price data
 * @param shippingUSD    - Shipping estimate for Amazon
 * @returns Average savings in USD (positive = Amazon is cheaper)
 */
export function averageAmazonSavingsVsLocal(
  offers: RetailerOffer[],
  shippingUSD = 12,
): number {
  const amazonOffer  = offers.find(o => o.retailerId === 'amazon')
  const localOffers  = offers.filter(o =>
    ['mercadolibre', 'alkosto', 'falabella', 'exito'].includes(o.retailerId),
  )

  if (!amazonOffer || localOffers.length === 0) return 0

  const amazonLanded  = amazonOffer.priceUSD + shippingUSD
  const avgLocalPrice = localOffers.reduce((sum, o) => sum + o.priceUSD, 0) / localOffers.length

  return Math.max(0, avgLocalPrice - amazonLanded)
}

// ── ProductPriceStats computation ─────────────────────────────────────────────

/**
 * Compute ProductPriceStats from a TrackedProduct's current offers and history.
 *
 * This is a pure computation — call it whenever offers or history change,
 * then persist the result as the product's priceStats field.
 *
 * Phase N+2: this will run as a database trigger / edge function.
 *
 * @param product - TrackedProduct with loaded offers and history
 * @returns Computed statistics, or null if insufficient data
 */
export function computeProductPriceStats(
  product: TrackedProduct,
): ProductPriceStats | null {
  const { offers, history } = product

  const availableOffers = offers.filter(o =>
    o.availability === 'in_stock' || o.availability === 'limited',
  )

  if (availableOffers.length === 0 || history.length < 3) return null

  const bestOffer = selectBestOffer(availableOffers)
  if (!bestOffer) return null

  const allPrices = history.map(h => h.averagePriceUSD)
  const sorted    = [...allPrices].sort((a, b) => a - b)

  const allTimeLow    = Math.min(...history.map(h => h.lowestPriceUSD))
  const allTimeHigh   = Math.max(...history.map(h => h.highestPriceUSD))
  const avgPrice      = allPrices.reduce((s, v) => s + v, 0) / allPrices.length
  const medianPrice   = sorted[Math.floor(sorted.length / 2)]

  const atlEntry = history.find(h => h.lowestPriceUSD === allTimeLow)

  const now = new Date().toISOString()

  // Deferred: import from trends.ts at call site to avoid circular deps
  // computeVolatility, detectTrend, computeRollingAverages, isNearAllTimeLow, computeBuySignal
  // These are wired by the orchestration layer, not inline here.

  return {
    productId:              product.id,
    computedAt:             now,
    dataPoints:             history.length,
    periodStart:            history[0]?.date ?? now,
    periodEnd:              history[history.length - 1]?.date ?? now,
    currentBestPriceUSD:    bestOffer.priceUSD,
    currentBestRetailerId:  bestOffer.retailerId,
    currentBestLandedCostUSD: bestOffer.totalLandedCostUSD,
    allTimeLowestUSD:       allTimeLow,
    allTimeLowestAt:        atlEntry ? `${atlEntry.date}T00:00:00Z` : now,
    allTimeLowestRetailerId: atlEntry?.bestRetailerId ?? bestOffer.retailerId,
    allTimeHighestUSD:      allTimeHigh,
    averagePriceUSD:        Math.round(avgPrice * 100) / 100,
    medianPriceUSD:         Math.round(medianPrice * 100) / 100,
    // Rolling averages + trend + volatility + buy signal wired externally
    trend:                  'unknown',
    volatilityScore:        0,
    savingsVsHighPercent:   Math.round(((allTimeHigh - bestOffer.priceUSD) / allTimeHigh) * 100),
    isNearAllTimeLow:       (bestOffer.priceUSD - allTimeLow) / allTimeLow <= 0.05,
    buySignal:              'neutral',
  }
}
