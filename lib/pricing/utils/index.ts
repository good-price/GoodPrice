/**
 * GOODPRICE Pricing — Utils Public API
 *
 * Re-exports all pricing utility functions as a unified surface.
 * Import from here, not from individual utility files.
 */

// ── Currency formatting ───────────────────────────────────────────────────────
export {
  formatUSD,
  formatCOP,
  formatPrice,
  formatDualCurrency,
  formatPriceRange,
  formatUSDCompact,
  formatSavingsAmount,
  calculateLandedCostUSD,
  formatLandedCostBreakdown,
} from './currency'

// ── Savings calculations ──────────────────────────────────────────────────────
export {
  savingsPercent,
  savingsAmount,
  offerDiscountPercent,
  offerDiscountAmount,
  savingsVsLocal,
  savingsVsAllTimeHigh,
  savingsVs90dAverage,
  priceProximityToATL,
  computeBuySignal,
  selectBestOffer,
  selectRunnerUpOffer,
  savingsBadgeLabel,
} from './savings'

// ── Trend detection ───────────────────────────────────────────────────────────
export {
  detectTrend,
  computeVolatility,
  detectPriceDropEvents,
  priceChangeOverDays,
  isNearAllTimeLow,
  rollingAverage,
  computeRollingAverages,
} from './trends'

// ── Price comparison ──────────────────────────────────────────────────────────
export {
  sortOffersByLandedCost,
  sortOffersByPrice,
  buildOfferComparisonTable,
  pricePositionInRange,
  pricePositionLabel,
  generateSnapshotId,
  isAmazonCheaperThanLocal,
  averageAmazonSavingsVsLocal,
  computeProductPriceStats,
} from './comparison'

export type { OfferComparisonRow } from './comparison'

// ── Retailer ranking ──────────────────────────────────────────────────────────
export {
  rankRetailers,
  getRecommendedRetailer,
  assignContextualBadges,
  getRetailerBadges,
  isLocalRetailer,
  estimatedDeliveryDays,
} from './ranking'

export type { RetailerScore } from './ranking'
