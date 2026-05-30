/**
 * lib/catalog/self-healing/recovery-engine.ts
 *
 * Restores auto-suppressed products to the public catalog when their
 * live truth score has improved sufficiently.
 *
 * Recovery criteria:
 *   - Product is in suppressed.json (auto-suppressed by archive-engine)
 *   - Latest truth result has truthScore >= minRecoveryScore (default: 60)
 *   - Latest truth result status is NOT 'unavailable'
 *   - Latest truth check confidence is NOT 'failed'
 *
 * Conservative: we require a positive confirmation of recovery, not just
 * the absence of failure signals.
 *
 * SERVER-ONLY.
 */

import {
  loadSuppressedStore,
  loadAllResults,
  unsuppressProduct,
} from '@/lib/catalog/live-truth'
import type { HealingEvent } from './types'

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_MIN_RECOVERY_SCORE = 60

// ── Public API ────────────────────────────────────────────────────────────────

export interface RecoveryEngineOptions {
  dryRun?:           boolean
  maxRecover?:       number
  minRecoveryScore?: number
}

/**
 * Check all suppressed products and un-suppress those that have recovered.
 * Returns the list of newly recovered products.
 */
export function runRecoveryEngine(
  opts: RecoveryEngineOptions = {},
): HealingEvent[] {
  const {
    dryRun           = false,
    maxRecover       = 20,
    minRecoveryScore = DEFAULT_MIN_RECOVERY_SCORE,
  } = opts

  const suppressedStore = loadSuppressedStore()
  const allResults      = loadAllResults()
  const recovered: HealingEvent[] = []

  for (const [productId, entry] of Object.entries(suppressedStore.entries)) {
    if (recovered.length >= maxRecover) break

    const result = allResults[productId]
    if (!result) continue   // never re-checked since suppression — can't recover yet

    // Must have a reliable, positive check
    if (result.confidence === 'failed') continue
    if (result.status     === 'unavailable') continue
    if (result.truthScore  < minRecoveryScore) continue

    // Ensure the check happened AFTER suppression (not using the stale result that caused suppression)
    const suppressedAt = new Date(entry.suppressedAt).getTime()
    const checkedAt    = new Date(result.checkedAt).getTime()
    if (checkedAt <= suppressedAt) continue

    const event: HealingEvent = {
      productId,
      asin:       entry.asin,
      action:     'recover',
      reason:     `Truth score recovered to ${result.truthScore} (status: ${result.status}, confidence: ${result.confidence})`,
      truthScore: result.truthScore,
      ts:         new Date().toISOString(),
    }

    if (!dryRun) {
      unsuppressProduct(productId)
    }

    recovered.push(event)
  }

  return recovered
}
