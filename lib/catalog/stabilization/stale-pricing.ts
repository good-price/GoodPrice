/**
 * lib/catalog/stabilization/stale-pricing.ts
 *
 * Detects pricing health issues in the public catalog:
 *   - Stale prices: not validated in > STALE_DAYS days
 *   - Fake discounts: hasFakeDiscount = true in live-truth results
 *   - Extreme price drift: live price deviates > DRIFT_THRESHOLD_PCT from catalog
 *
 * Uses the live-truth result store for validation data.
 * Products with no live-truth entry are considered stale by default.
 *
 * SERVER-ONLY.
 */

import { loadAllResults }     from '@/lib/catalog/live-truth/reports'
import { getPublicProducts }  from '@/lib/catalog/public'
import type { PricingHealthReport } from './types'

// ── Constants ──────────────────────────────────────────────────────────────────

/** Days without re-validation before a price is considered stale */
const STALE_DAYS = 7

/** Price drift beyond this threshold is flagged as extreme */
const DRIFT_THRESHOLD_PCT = 30

// ── Helpers ────────────────────────────────────────────────────────────────────

function isStale(checkedAt: string | undefined): boolean {
  if (!checkedAt) return true
  const ageMs = Date.now() - new Date(checkedAt).getTime()
  return ageMs > STALE_DAYS * 86_400_000
}

function hasExtremeDrift(deltaPct: number | undefined): boolean {
  if (deltaPct === undefined) return false
  return Math.abs(deltaPct) > DRIFT_THRESHOLD_PCT
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Builds a pricing health report for the current public catalog.
 * Only analyzes publicly visible products (tier != suppressed).
 */
export function buildPricingHealthReport(): PricingHealthReport {
  const publicProducts = getPublicProducts()
  const allResults     = loadAllResults()

  const totalAnalyzed    = publicProducts.length
  const needsRevalidation: string[] = []

  let staleCount       = 0
  let fakDiscountCount = 0
  let driftedCount     = 0
  let unreliableCount  = 0
  let totalTruthScore  = 0
  let scoredCount      = 0

  for (const product of publicProducts) {
    if (!product.id) continue

    const result = allResults[product.id]

    // Stale detection
    const stale = isStale(result?.checkedAt)
    if (stale) staleCount++

    // Live-truth results
    let fakeDiscount = false
    let drifted      = false

    if (result) {
      if (result.hasFakeDiscount) {
        fakeDiscount = true
        fakDiscountCount++
      }

      if (hasExtremeDrift(result.pricing?.deltaPct)) {
        drifted = true
        driftedCount++
      }

      if (result.confidence !== 'failed') {
        totalTruthScore += result.truthScore
        scoredCount++
      }
    }

    // Unreliable = any of: stale OR fakeDiscount OR extreme drift
    if (stale || fakeDiscount || drifted) {
      unreliableCount++
      needsRevalidation.push(product.id)
    }
  }

  const stalePct      = totalAnalyzed > 0 ? Math.round((staleCount / totalAnalyzed) * 100 * 10) / 10 : 0
  const unreliablePct = totalAnalyzed > 0 ? Math.round((unreliableCount / totalAnalyzed) * 100 * 10) / 10 : 0
  const avgTruthScore = scoredCount > 0 ? Math.round(totalTruthScore / scoredCount) : 0

  return {
    totalAnalyzed,
    staleCount,
    fakDiscountCount,
    driftedCount,
    unreliableCount,
    stalePct,
    unreliablePct,
    avgTruthScore,
    needsRevalidation,
  }
}

/**
 * Computes a pricing health score (0–100) for use in CatalogHealthScore.
 * Full score when 0% unreliable; 0 when ≥80% unreliable.
 */
export function computePricingHealth(report: PricingHealthReport): number {
  // Linear: 0% unreliable → 100, 80%+ unreliable → 0
  const unreliable = Math.min(report.unreliablePct, 80)
  return Math.max(0, Math.round(100 - (unreliable / 80) * 100))
}
