/**
 * lib/catalog/intelligence/product-lifecycle.ts
 *
 * Assigns a lifecycle state to every product based on health + engagement.
 *
 * State priority (highest wins):
 *   1. quarantined → in audit quarantine file
 *   2. archived    → inactive status + no engagement
 *   3. unhealthy   → health < 30
 *   4. new         → unverified status + no repair history + no clicks
 *   5. trending    → top 15% engagement + health ≥ 65
 *   6. healthy     → health ≥ 70 + clicks > 0
 *   7. stable      → health 50-70 + clicks > 0
 *   8. declining   → health 30-60 + clicks > 0 (engagement exists but health dropping)
 *   9. stale       → everything else (health ok but no engagement)
 */

import type { Product } from '@/types'
import type { ProductHealthScore, EngagementScore, ProductLifecycleState } from './types'
import type { QuarantineStore } from '@/lib/audit/types'
import type { ReplacementEntry } from '@/lib/catalog/repair/types'

// ── Thresholds ─────────────────────────────────────────────────────────────────

const UNHEALTHY_THRESHOLD  = 30
const HEALTHY_THRESHOLD    = 70
const STABLE_THRESHOLD     = 50
const DECLINING_THRESHOLD  = 30
const TRENDING_HEALTH_MIN  = 65
const TRENDING_ENGAGEMENT_TOP_PCT = 0.15  // top 15% globally

// ── Single product lifecycle ───────────────────────────────────────────────────

export function determineLifecycleState(
  product: Product,
  health: ProductHealthScore,
  engagement: EngagementScore | null,
  quarantine: QuarantineStore,
  replacements: ReplacementEntry[],
  totalProducts: number,
): ProductLifecycleState {
  const id = product.id ?? ''

  // Priority 1: Quarantined
  if (quarantine.entries[id]) return 'quarantined'

  // Priority 2: Archived — inactive + no clicks
  if (product.status === 'inactive' && (engagement?.totalClicks ?? 0) === 0) {
    return 'archived'
  }

  // Priority 3: Unhealthy
  if (health.total < UNHEALTHY_THRESHOLD) return 'unhealthy'

  const clicks       = engagement?.totalClicks ?? 0
  const globalRank   = engagement?.globalRank ?? totalProducts
  const engThreshold = Math.ceil(totalProducts * TRENDING_ENGAGEMENT_TOP_PCT)

  // Priority 4: New — unverified + no repair history + no engagement
  if (
    product.status === 'unverified' &&
    clicks === 0 &&
    !replacements.some(r => r.productId === id)
  ) {
    return 'new'
  }

  // Priority 5: Trending — high engagement + healthy
  if (clicks > 0 && globalRank <= engThreshold && health.total >= TRENDING_HEALTH_MIN) {
    return 'trending'
  }

  // Priority 6: Healthy — good health + some engagement
  if (health.total >= HEALTHY_THRESHOLD && clicks > 0) return 'healthy'

  // Priority 7: Stable — moderate health + some engagement
  if (health.total >= STABLE_THRESHOLD && clicks > 0) return 'stable'

  // Priority 8: Declining — low-moderate health + still engaged
  if (health.total >= DECLINING_THRESHOLD && clicks > 0) return 'declining'

  // Priority 9: Stale (default)
  return 'stale'
}

/**
 * Assigns lifecycle states to all products.
 * Returns Record<productId, ProductLifecycleState>.
 */
export function computeAllLifecycleStates(
  products: Product[],
  healthScores: ProductHealthScore[],
  engagementScores: EngagementScore[],
  quarantine: QuarantineStore,
  replacements: ReplacementEntry[],
): Record<string, ProductLifecycleState> {
  const healthMap     = new Map(healthScores.map(h => [h.productId, h]))
  const engagementMap = new Map(engagementScores.map(e => [e.productId, e]))

  const result: Record<string, ProductLifecycleState> = {}
  const total = products.length

  for (const product of products) {
    const id         = product.id ?? ''
    const health     = healthMap.get(id)
    const engagement = engagementMap.get(id) ?? null

    if (!health) {
      result[id] = 'stale'
      continue
    }

    result[id] = determineLifecycleState(
      product,
      health,
      engagement,
      quarantine,
      replacements,
      total,
    )
  }

  return result
}

// ── Summary helpers ────────────────────────────────────────────────────────────

export function countByLifecycle(
  states: Record<string, ProductLifecycleState>,
): Record<ProductLifecycleState, number> {
  const counts: Record<ProductLifecycleState, number> = {
    new: 0, healthy: 0, trending: 0, stable: 0,
    declining: 0, stale: 0, unhealthy: 0, quarantined: 0, archived: 0,
  }
  for (const state of Object.values(states)) {
    counts[state]++
  }
  return counts
}
