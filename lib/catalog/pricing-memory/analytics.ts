/**
 * lib/catalog/pricing-memory/analytics.ts
 *
 * Price analytics engine — Sprint 4E.
 *
 * Pure functions — no I/O, no side effects.
 *
 * computePriceVolatility(snapshots): 0-100
 *   Measures how much the price fluctuates relative to the mean.
 *   Based on coefficient of variation (stddev / mean * 100), capped at 100.
 *   0 = perfectly stable, 100 = extremely volatile.
 *   Returns 0 if fewer than 2 snapshots.
 *
 * computePriceTrend(snapshots): 'rising' | 'falling' | 'stable'
 *   Compares the rolling mean of the last quarter vs the first quarter of
 *   snapshots. A difference of > 5% triggers rising/falling.
 *   Returns 'stable' if fewer than 4 snapshots.
 *
 * computePriceOpportunity(history): 0-100
 *   Higher score = better buying opportunity right now.
 *   Factors:
 *     - How close latestPrice is to lowestPrice (nearLow:  40 pts)
 *     - How far latestPrice is below averagePrice (belowAvg: 40 pts)
 *     - Moderate volatility bonus (20 pts) — volatile products have bigger dips
 *
 * SERVER-ONLY.
 */

import type { PriceSnapshot, ProductPriceHistory, PriceTrend } from './types'

// ── Internal helpers ──────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Computes price volatility from 0 to 100.
 *
 * Uses coefficient of variation (CV = stddev / mean * 100).
 * Scores:
 *   CV ≥ 30% → 100
 *   Linearly scaled between 0 and 30%.
 */
export function computePriceVolatility(snapshots: PriceSnapshot[]): number {
  if (snapshots.length < 2) return 0

  const prices = snapshots.map(s => s.price)
  const avg    = mean(prices)
  if (avg === 0) return 0

  const cv    = (stddev(prices, avg) / avg) * 100  // coefficient of variation as %
  // Scale: CV of 30% = volatility 100
  const score = clamp(Math.round((cv / 30) * 100), 0, 100)
  return score
}

/**
 * Determines price trend by comparing the mean of the last 25% of snapshots
 * to the mean of the first 25%. Requires at least 4 snapshots.
 *
 * Change threshold: ±5% relative to the early mean.
 */
export function computePriceTrend(snapshots: PriceSnapshot[]): PriceTrend {
  if (snapshots.length < 4) return 'stable'

  const quarter = Math.max(1, Math.floor(snapshots.length / 4))
  const earlyPrices  = snapshots.slice(0, quarter).map(s => s.price)
  const recentPrices = snapshots.slice(-quarter).map(s => s.price)

  const earlyMean  = mean(earlyPrices)
  const recentMean = mean(recentPrices)
  if (earlyMean === 0) return 'stable'

  const changePct = ((recentMean - earlyMean) / earlyMean) * 100

  if (changePct >  5) return 'rising'
  if (changePct < -5) return 'falling'
  return 'stable'
}

/**
 * Computes buying opportunity score from 0 to 100.
 *
 * Higher = better opportunity now.
 *
 * Components:
 *   nearLow (0-40):   how close latestPrice is to lowestPrice
 *     → 40 pts when latestPrice === lowestPrice
 *     → 0 pts when latestPrice === highestPrice
 *   belowAvg (0-40):  how far latestPrice is below the average
 *     → 40 pts when latestPrice === lowestPrice and lowestPrice << averagePrice
 *     → 0 pts when latestPrice >= averagePrice
 *   volatilityBonus (0-20): moderate volatility means bigger dip potential
 *     → 20 pts when volatility is 40-70 (the sweet spot)
 *     → 0 pts for very low or very high volatility
 */
export function computePriceOpportunity(
  history:    ProductPriceHistory,
  volatility: number,
): number {
  const { latestPrice, lowestPrice, highestPrice, averagePrice } = history

  if (highestPrice === lowestPrice || highestPrice === 0) return 0
  if (latestPrice <= 0 || averagePrice <= 0) return 0

  // Component 1: near low (40 pts)
  const priceRange = highestPrice - lowestPrice
  const distFromLow = latestPrice - lowestPrice
  const nearLow = priceRange > 0
    ? clamp(Math.round(40 * (1 - distFromLow / priceRange)), 0, 40)
    : 0

  // Component 2: below average (40 pts)
  const belowAvgPct = ((averagePrice - latestPrice) / averagePrice) * 100
  const belowAvg = clamp(Math.round(belowAvgPct * 2), 0, 40)  // 20% below avg → full 40 pts

  // Component 3: volatility bonus (0-20)
  // Sweet spot: 40-70 volatility (meaningful swings but not chaotic)
  const volBonus =
    volatility >= 40 && volatility <= 70 ? 20 :
    volatility > 70                       ? Math.round(20 * (1 - (volatility - 70) / 30)) :
    volatility > 20                       ? Math.round(20 * ((volatility - 20) / 20)) :
    0

  return clamp(nearLow + belowAvg + clamp(volBonus, 0, 20), 0, 100)
}

/**
 * Computes all analytics for a product and returns them together.
 * Convenience wrapper for pipeline integration.
 */
export function computeProductAnalytics(
  history: ProductPriceHistory,
): {
  volatility: number
  trend:      PriceTrend
  opportunity: number
} {
  const volatility  = computePriceVolatility(history.snapshots)
  const trend       = computePriceTrend(history.snapshots)
  const opportunity = computePriceOpportunity(history, volatility)
  return { volatility, trend, opportunity }
}
