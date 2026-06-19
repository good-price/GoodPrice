/**
 * lib/catalog/lifecycle/health.ts
 *
 * Lifecycle Health Engine — Sprint 4D.
 *
 * Computes health state from staleDays + confidenceScore.
 * Pure functions — no I/O, no side effects.
 *
 * Health thresholds:
 *   healthy   staleDays < 15
 *   aging     15 ≤ staleDays < 30
 *   stale     30 ≤ staleDays < 60
 *   critical  staleDays ≥ 60
 *
 * Refresh / replacement:
 *   needsRefresh     = health is NOT healthy (aging, stale, or critical)
 *   needsReplacement = health is critical OR confidenceScore < 35
 *
 * SERVER-ONLY.
 */

import type { LifecycleHealth } from './types'

// ── Thresholds ─────────────────────────────────────────────────────────────────

const AGING_DAYS    = 15
const STALE_DAYS    = 30
const CRITICAL_DAYS = 60

const REPLACEMENT_CONFIDENCE_THRESHOLD = 35

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthResult {
  health:           LifecycleHealth
  needsRefresh:     boolean
  needsReplacement: boolean
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Computes lifecycle health from stale days and confidence score.
 *
 * @param staleDays      Days since last validation (or lastSeenAt).
 * @param confidenceScore 0-100 — from trust/intelligence engine.
 */
export function computeLifecycleHealth(
  staleDays:       number,
  confidenceScore: number,
): HealthResult {
  const health: LifecycleHealth =
    staleDays < AGING_DAYS    ? 'healthy'  :
    staleDays < STALE_DAYS    ? 'aging'    :
    staleDays < CRITICAL_DAYS ? 'stale'    :
                                'critical'

  const needsRefresh     = health !== 'healthy'
  const needsReplacement = health === 'critical' || confidenceScore < REPLACEMENT_CONFIDENCE_THRESHOLD

  return { health, needsRefresh, needsReplacement }
}
