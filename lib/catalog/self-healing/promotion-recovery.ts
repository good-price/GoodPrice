/**
 * lib/catalog/self-healing/promotion-recovery.ts
 *
 * Flags products that have been successfully recovered from auto-suppression
 * as promotion candidates. This allows the intelligence snapshot to give
 * recovered products a temporary visibility boost — helping verify that
 * real users can find and engage with them after recovery.
 *
 * Currently writes recovery events to the healing log (via reports.ts).
 * Future: could write a promotionRecoveries.json for the snapshot generator
 * to pick up and boost rankings.
 *
 * SERVER-ONLY.
 */

import type { HealingEvent } from './types'

// ── Public API ────────────────────────────────────────────────────────────────

export interface PromotionRecoveryResult {
  /** Product IDs flagged as promotion candidates. */
  promoted: string[]
}

/**
 * Process a list of newly-recovered products and flag them for promotion.
 * Currently returns the list of promoted IDs (logging is handled by auto-repair).
 *
 * @param recoveredEvents  Events from the recovery engine (action === 'recover').
 */
export function runPromotionRecovery(
  recoveredEvents: HealingEvent[],
): PromotionRecoveryResult {
  const promoted: string[] = []

  for (const event of recoveredEvents) {
    if (event.action !== 'recover') continue
    // Only promote products that recovered with a solid score
    if (event.truthScore < 65) continue
    promoted.push(event.productId)
  }

  return { promoted }
}
