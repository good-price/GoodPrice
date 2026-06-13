/**
 * lib/ops/activation/recovery-metrics.ts
 *
 * Computes before/after recovery impact metrics.
 * Reads the current visibility state and compares it against a baseline snapshot.
 *
 * SERVER-ONLY.
 */

import { computeVisibilityRatios } from '@/lib/catalog/stabilization/visibility-balancer'
import { computeCatalogHealthScore } from '@/lib/catalog/stabilization/catalog-health'
import type { VisibilitySnapshot, RecoveryImpact } from './types'

// ── Snapshot builder ──────────────────────────────────────────────────────────

/**
 * Captures a point-in-time visibility snapshot.
 * Called before and after a recovery run for comparison.
 */
export function captureVisibilitySnapshot(): VisibilitySnapshot {
  let ratios = { total: 0, active: 0, warning: 0, degraded: 0, suppressed: 0, visible: 0, visiblePct: 0 }
  let healthScore = 0

  try {
    ratios = computeVisibilityRatios()
  } catch { /* catalog not initialized */ }

  try {
    healthScore = computeCatalogHealthScore().overall
  } catch { /* catalog not initialised */ }

  return {
    capturedAt:  new Date().toISOString(),
    total:       ratios.total,
    active:      ratios.active,
    warning:     ratios.warning,
    degraded:    ratios.degraded,
    suppressed:  ratios.suppressed,
    visiblePct:  Math.round(ratios.visiblePct),
    healthScore,
  }
}

// ── Impact calculator ─────────────────────────────────────────────────────────

/**
 * Computes the delta between before and after snapshots.
 * Positive values are improvements.
 */
export function computeRecoveryImpact(
  before:          VisibilitySnapshot,
  after:           VisibilitySnapshot,
  recoveredCount:  number,
  repairedCount:   number,
  successRate:     number,
): RecoveryImpact {
  const visibleBefore = before.active + before.warning + before.degraded
  const visibleAfter  = after.active  + after.warning  + after.degraded

  return {
    visibleDelta:    visibleAfter - visibleBefore,
    suppressedDelta: after.suppressed - before.suppressed,   // negative = improvement
    activeDelta:     after.active - before.active,
    healthDelta:     after.healthScore - before.healthScore,
    recoveredCount,
    repairedCount,
    successRate,
  }
}
