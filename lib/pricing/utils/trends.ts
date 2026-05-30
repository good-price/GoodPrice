/**
 * GOODPRICE Pricing — Price Trend Detection
 *
 * Analyzes a time series of price data to detect movement direction,
 * volatility, and significant drop events.
 *
 * Algorithm design decisions:
 *   - Minimum 3 data points to compute any trend ('unknown' below that)
 *   - Uses linear regression slope for trend direction (robust to noise)
 *   - Uses coefficient of variation (CV = σ/μ) for volatility scoring
 *   - Significant drop threshold: > 5% drop between consecutive points
 *
 * All functions are pure: same inputs always produce same outputs.
 *
 * Future Phase N+3 enhancements:
 *   - Seasonality detection (Black Friday, holiday patterns)
 *   - Exponential smoothing for more responsive trend detection
 *   - Anomaly detection (flash sales vs genuine price reductions)
 */

import type { PriceHistoryPoint, PriceTrend, PriceDropEvent } from '../types'

// ── Configuration ─────────────────────────────────────────────────────────────

const TREND_CONFIG = {
  /** Minimum data points needed to compute a meaningful trend */
  minDataPoints: 3,
  /** Slope threshold above which trend is 'rising' (% per day) */
  risingThreshold: 0.5,
  /** Slope threshold below which trend is 'falling' (% per day) */
  fallingThreshold: -0.5,
  /** CV (std/mean) above which the price is considered 'volatile' */
  volatileCV: 0.15,
  /** CV below which the price is considered 'stable' */
  stableCV: 0.05,
  /** Minimum percentage drop to record as a PriceDropEvent */
  significantDropPercent: 5,
} as const

// ── Core statistics ───────────────────────────────────────────────────────────

/** Calculate the mean of an array of numbers */
function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Calculate the sample standard deviation of an array */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const squaredDiffs = values.map(v => (v - avg) ** 2)
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1))
}

/**
 * Compute the linear regression slope (change per unit index).
 * Returns positive slope for rising prices, negative for falling.
 *
 * Uses least squares method for robustness against individual outliers.
 *
 * @param values - Ordered array of price values (oldest first)
 * @returns Slope as % change per day (relative to mean price)
 */
function linearRegressionSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0

  const avg = mean(values)
  if (avg === 0) return 0

  // Normalize to indices 0..n-1
  const xMean = (n - 1) / 2
  let numerator   = 0
  let denominator = 0

  for (let i = 0; i < n; i++) {
    numerator   += (i - xMean) * (values[i] - avg)
    denominator += (i - xMean) ** 2
  }

  if (denominator === 0) return 0

  // Express as % of mean per index step
  return (numerator / denominator / avg) * 100
}

// ── Trend detection ───────────────────────────────────────────────────────────

/**
 * Detect the price trend direction from a series of price history points.
 *
 * @param history - Ordered price history (oldest first)
 * @param days    - Number of recent days to analyze (default: all points)
 * @returns Detected trend direction
 */
export function detectTrend(
  history: PriceHistoryPoint[],
  days?: number,
): PriceTrend {
  const window = days ? history.slice(-days) : history

  if (window.length < TREND_CONFIG.minDataPoints) return 'unknown'

  const prices = window.map(p => p.averagePriceUSD)
  const cv = stdDev(prices) / mean(prices)

  // Volatile takes precedence: high variance regardless of direction
  if (cv >= TREND_CONFIG.volatileCV) return 'volatile'

  // Stable: very low variance
  if (cv <= TREND_CONFIG.stableCV) return 'stable'

  // Direction from linear regression slope
  const slope = linearRegressionSlope(prices)
  if (slope >= TREND_CONFIG.risingThreshold)   return 'rising'
  if (slope <= TREND_CONFIG.fallingThreshold)  return 'falling'

  return 'stable'
}

// ── Volatility scoring ────────────────────────────────────────────────────────

/**
 * Compute a normalized volatility score (0–1).
 * 0 = completely stable price, 1 = extremely volatile.
 *
 * Uses coefficient of variation clamped to [0, 1].
 *
 * @param history - Ordered price history
 * @returns Volatility score in [0, 1]
 */
export function computeVolatility(history: PriceHistoryPoint[]): number {
  if (history.length < 2) return 0

  const prices = history.map(p => p.averagePriceUSD)
  const avg = mean(prices)
  if (avg === 0) return 0

  const cv = stdDev(prices) / avg

  // Normalize: cap at 0.5 CV (50% volatility) → score 1.0
  return Math.min(1, cv / 0.5)
}

// ── Price drop detection ──────────────────────────────────────────────────────

/**
 * Find all significant price drop events in a price history series.
 *
 * A drop event is recorded when the daily lowest price drops by more than
 * SIGNIFICANT_DROP_PERCENT vs the previous day's average.
 *
 * @param history   - Ordered price history (oldest first)
 * @param productId - Product ID to embed in events
 * @param retailerId- Retailer ID to embed in events
 * @param allTimeLow- Known all-time low price in USD
 * @returns Array of detected drop events (may be empty)
 */
export function detectPriceDropEvents(
  history: PriceHistoryPoint[],
  productId: string,
  retailerId: string,
  allTimeLow: number,
): PriceDropEvent[] {
  const events: PriceDropEvent[] = []

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]
    const curr = history[i]

    const prevPrice = prev.averagePriceUSD
    const currPrice = curr.lowestPriceUSD // use day's low, not average

    if (prevPrice <= 0) continue
    const dropPct = ((prevPrice - currPrice) / prevPrice) * 100

    if (dropPct >= TREND_CONFIG.significantDropPercent) {
      const isATL = currPrice <= allTimeLow

      events.push({
        id: `drop-${productId}-${curr.date}`,
        productId,
        retailerId,
        previousPriceUSD: prevPrice,
        newPriceUSD: currPrice,
        dropAmountUSD: Math.round((prevPrice - currPrice) * 100) / 100,
        dropPercent: Math.round(dropPct * 10) / 10,
        isAllTimeLow: isATL,
        detectedAt: `${curr.date}T00:00:00Z`,
        alertsDispatched: false,
      })
    }
  }

  return events
}

// ── Price change metrics ──────────────────────────────────────────────────────

/**
 * Calculate the price change over a window of N most recent days.
 *
 * @param history - Ordered history (oldest first)
 * @param days    - Window size in days
 * @returns Object with absolute and percentage change; null if insufficient data
 */
export function priceChangeOverDays(
  history: PriceHistoryPoint[],
  days: number,
): { absoluteUSD: number; percentChange: number } | null {
  if (history.length < 2) return null

  const window = history.slice(-days)
  if (window.length < 2) return null

  const earliest = window[0].averagePriceUSD
  const latest   = window[window.length - 1].averagePriceUSD

  if (earliest <= 0) return null

  const absoluteUSD   = Math.round((latest - earliest) * 100) / 100
  const percentChange = Math.round(((latest - earliest) / earliest) * 1_000) / 10

  return { absoluteUSD, percentChange }
}

/**
 * Check whether the current price is near the all-time low.
 *
 * @param currentPriceUSD - Current best price
 * @param allTimeLowUSD   - Historical minimum price
 * @param tolerancePct    - How close counts as "near" (default: 5%)
 * @returns true if price is within tolerance% of the all-time low
 */
export function isNearAllTimeLow(
  currentPriceUSD: number,
  allTimeLowUSD: number,
  tolerancePct = 5,
): boolean {
  if (!isFinite(currentPriceUSD) || !isFinite(allTimeLowUSD)) return false
  if (allTimeLowUSD <= 0) return false
  const proximity = ((currentPriceUSD - allTimeLowUSD) / allTimeLowUSD) * 100
  return proximity <= tolerancePct
}

// ── Rolling averages ──────────────────────────────────────────────────────────

/**
 * Compute a rolling N-day average price from history.
 *
 * @param history - Ordered history (oldest first)
 * @param days    - Rolling window size
 * @returns Average price over the last N days in USD, or null if insufficient
 */
export function rollingAverage(
  history: PriceHistoryPoint[],
  days: number,
): number | null {
  const window = history.slice(-days)
  if (window.length === 0) return null
  const avg = mean(window.map(p => p.averagePriceUSD))
  return Math.round(avg * 100) / 100
}

/**
 * Compute 30-day and 90-day rolling averages in one pass.
 *
 * @param history - Full price history
 * @returns Object with avg30d and avg90d (null if insufficient data)
 */
export function computeRollingAverages(
  history: PriceHistoryPoint[],
): { avg30d: number | null; avg90d: number | null } {
  return {
    avg30d: rollingAverage(history, 30),
    avg90d: rollingAverage(history, 90),
  }
}
