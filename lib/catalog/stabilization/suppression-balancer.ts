/**
 * lib/catalog/stabilization/suppression-balancer.ts
 *
 * Analyzes which gates are driving suppression pressure so recommendations
 * can prioritize the highest-impact recovery actions.
 *
 * "Suppression pressure" measures how aggressively the current catalog state
 * is being hidden from users. High pressure = many products suppressed by
 * a small set of remediable causes.
 *
 * SERVER-ONLY.
 */

import { getAllProducts }            from '@/data/catalog'
import { computeCatalogVisibility } from '@/lib/catalog/trust/visibility-engine'
import type { SuppressionBreakdown, SuppressionPressure, VisibilityRatios } from './types'

// ── Pressure thresholds ────────────────────────────────────────────────────────

const PRESSURE_LOW      = 25
const PRESSURE_MODERATE = 50
const PRESSURE_HIGH     = 75

// ── Gate recoverability map ────────────────────────────────────────────────────

/**
 * Which gates produce RECOVERABLE suppressions (automated action can fix):
 *   gate-7  — audit scores (run fresh audit)
 *   gate-9  — dead link (run link audit + retry)
 *   gate-10 — Colombia unavailable (run colombia audit)
 *   gate-11 — healing suppression (run live-truth cycle)
 *
 * Hard gates (NOT recoverable without manual edits):
 *   gate-1 (inactive status)
 *   gate-2 (Colombia restriction flag)
 *   gate-3 (quarantine)
 *   gate-4 (invalid ASIN)
 *   gate-5 / gate-5e (invalid image)
 *   gate-8 (intelligence CRITICAL)
 */
const RECOVERABLE_GATES = new Set(['gate-7', 'gate-9', 'gate-10', 'gate-11'])

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Computes suppression pressure from current catalog visibility state.
 */
export function computeSuppressionPressure(ratios: VisibilityRatios): SuppressionPressure {
  const products = getAllProducts()
  const results  = computeCatalogVisibility(products)

  // Build gate → suppression count map
  const gateCounts: Record<string, number> = {}
  let recoverableCount = 0
  let hardSuppressed   = 0

  for (const result of results) {
    if (result.tier !== 'suppressed') continue

    // Determine if this suppression is recoverable (any signal from a soft gate)
    const hasRecoverableGate = result.signals.some(s => RECOVERABLE_GATES.has(s.gate))

    if (hasRecoverableGate) {
      recoverableCount++
    } else {
      hardSuppressed++
    }

    // Count gate contributions (first signal = primary gate for this product)
    for (const signal of result.signals) {
      if (signal.tier === 'suppressed') {
        gateCounts[signal.gate] = (gateCounts[signal.gate] ?? 0) + 1
      }
    }
  }

  const total      = ratios.total
  const suppressed = ratios.suppressed

  // Build breakdown sorted by count desc
  const breakdown: SuppressionBreakdown[] = Object.entries(gateCounts)
    .map(([gateKey, count]) => ({
      reason:      gateKey,
      count,
      pct:         total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0,
      recoverable: RECOVERABLE_GATES.has(gateKey),
    }))
    .sort((a, b) => b.count - a.count)

  // Primary gate = gate causing most suppressions
  const primaryGate = breakdown[0]?.reason ?? 'none'

  // Pressure score (0–100): weighted by suppression %, with bonus for hard suppressions
  const basePct     = total > 0 ? (suppressed / total) * 100 : 0
  const hardWeight  = total > 0 ? (hardSuppressed / total) * 20 : 0
  const score       = Math.min(100, Math.round(basePct + hardWeight))

  let level: SuppressionPressure['level']
  if (score >= PRESSURE_HIGH)     level = 'critical'
  else if (score >= PRESSURE_MODERATE) level = 'high'
  else if (score >= PRESSURE_LOW) level = 'moderate'
  else                            level = 'low'

  return {
    score,
    level,
    primaryGate,
    breakdown,
    recoverableCount,
    hardSuppressed,
  }
}

/**
 * Computes a suppression health score (0–100) for the composite health score.
 * Inverse of suppression pressure — full score when pressure is 0.
 */
export function computeSuppressionHealth(pressure: SuppressionPressure): number {
  return Math.max(0, 100 - pressure.score)
}
