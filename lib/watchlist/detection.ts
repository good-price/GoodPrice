/**
 * GOODPRICE Watchlist — Alert Detection Engine
 *
 * Pure functions that evaluate whether an alert subscription's trigger
 * conditions are met given the current pricing data.
 *
 * Reuses lib/pricing/ utilities — no duplicate logic.
 *
 * Called by POST /api/alerts/detect (triggered by the hourly cron, or manually).
 *
 * All functions are pure: same inputs → same output, no I/O.
 */

import type { AlertSubscription, AlertDetectionResult } from './types'
import type { PriceSnapshot } from '../pricing/types'
import { isNearAllTimeLow } from '../pricing/utils/trends'

// ── Drop thresholds ───────────────────────────────────────────────────────────

/** Minimum price drop to qualify as 'significant' for 'any_drop' trigger (%) */
const ANY_DROP_THRESHOLD_PCT = 3

// ── Core detection functions ──────────────────────────────────────────────────

/**
 * Check if the current price is an all-time low across all recorded snapshots.
 * Uses the same 5% tolerance as isNearAllTimeLow from pricing utils.
 *
 * @param currentPriceUSD - Current ML offer price
 * @param snapshots       - All historical snapshots for this product+retailer
 */
export function checkIsAllTimeLow(
  currentPriceUSD: number,
  snapshots: PriceSnapshot[],
): boolean {
  if (snapshots.length < 3) return false
  const historicMin = Math.min(...snapshots.map(s => s.priceUSD))
  return isNearAllTimeLow(currentPriceUSD, historicMin)
}

/**
 * Check whether the current price represents a meaningful drop from the
 * baseline (catalog/subscription price or recent average).
 *
 * Uses the last 7 snapshots as the "recent average" reference.
 *
 * @param currentPriceUSD   - Current ML offer price
 * @param baselinePriceUSD  - Catalog price at subscription creation
 * @param snapshots         - All historical snapshots (sorted ascending)
 * @returns true if the price has dropped ≥ ANY_DROP_THRESHOLD_PCT
 */
export function checkSignificantDrop(
  currentPriceUSD: number,
  baselinePriceUSD: number,
  snapshots: PriceSnapshot[],
): boolean {
  if (currentPriceUSD >= baselinePriceUSD) return false

  // Use the most relevant reference: recent ML average if available, else catalog
  const recentSnapshots = snapshots.slice(-7)
  const reference = recentSnapshots.length >= 3
    ? recentSnapshots.reduce((sum, s) => sum + s.priceUSD, 0) / recentSnapshots.length
    : baselinePriceUSD

  if (reference <= 0) return false
  const dropPct = ((reference - currentPriceUSD) / reference) * 100
  return dropPct >= ANY_DROP_THRESHOLD_PCT
}

// ── Main condition evaluator ──────────────────────────────────────────────────

/**
 * Evaluate whether an alert subscription should trigger.
 *
 * @param subscription    - The subscription to evaluate
 * @param currentPriceUSD - Current ML offer price in USD
 * @param snapshots       - All historical price snapshots for this product
 * @returns Detection result with triggered flag and human-readable reason
 */
export function evaluateAlertCondition(
  subscription: AlertSubscription,
  currentPriceUSD: number,
  snapshots: PriceSnapshot[],
): AlertDetectionResult {
  const base: AlertDetectionResult = {
    subscriptionId:  subscription.id,
    productId:       subscription.productId,
    email:           subscription.email,
    triggered:       false,
    currentPriceUSD,
    targetPriceUSD:  subscription.targetPriceUSD,
  }

  switch (subscription.trigger) {
    case 'price_below': {
      if (!subscription.targetPriceUSD) {
        return { ...base, reason: 'Falta precio objetivo' }
      }
      if (currentPriceUSD <= subscription.targetPriceUSD) {
        return {
          ...base,
          triggered: true,
          reason: `Precio $${currentPriceUSD.toFixed(2)} bajó del objetivo $${subscription.targetPriceUSD.toFixed(2)}`,
        }
      }
      return { ...base, reason: `Precio $${currentPriceUSD} > objetivo $${subscription.targetPriceUSD}` }
    }

    case 'all_time_low': {
      const isATL = checkIsAllTimeLow(currentPriceUSD, snapshots)
      if (isATL) {
        return {
          ...base,
          triggered: true,
          reason:    `¡Precio mínimo histórico! $${currentPriceUSD.toFixed(2)}`,
        }
      }
      return { ...base, reason: 'No es mínimo histórico aún' }
    }

    case 'any_drop': {
      const hasDrop = checkSignificantDrop(
        currentPriceUSD,
        subscription.catalogPriceUSD,
        snapshots,
      )
      if (hasDrop) {
        return {
          ...base,
          triggered: true,
          reason:    `Caída de precio detectada: $${currentPriceUSD.toFixed(2)} vs referencia $${subscription.catalogPriceUSD.toFixed(2)}`,
        }
      }
      return { ...base, reason: 'Sin caída significativa detectada' }
    }

    default:
      return { ...base, reason: 'Trigger desconocido' }
  }
}

// ── Batch evaluation helper ───────────────────────────────────────────────────

/**
 * Batch-evaluate a list of subscriptions and separate triggered from pending.
 *
 * @param subscriptions    - List of active subscriptions
 * @param getPriceFn       - Async function returning current price for a productId
 * @param getSnapshotsFn   - Async function returning snapshots for a productId
 */
export async function runDetectionBatch(
  subscriptions: AlertSubscription[],
  getPriceFn:     (productId: string) => Promise<number | null>,
  getSnapshotsFn: (productId: string) => Promise<PriceSnapshot[]>,
): Promise<AlertDetectionResult[]> {
  const results: AlertDetectionResult[] = []

  for (const sub of subscriptions) {
    const [currentPrice, snapshots] = await Promise.all([
      getPriceFn(sub.productId),
      getSnapshotsFn(sub.productId),
    ])

    if (currentPrice === null) {
      results.push({
        subscriptionId: sub.id,
        productId:      sub.productId,
        email:          sub.email,
        triggered:      false,
        reason:         'Sin precio actual disponible',
      })
      continue
    }

    results.push(evaluateAlertCondition(sub, currentPrice, snapshots))
  }

  return results
}
