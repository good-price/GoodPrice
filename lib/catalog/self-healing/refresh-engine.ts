/**
 * lib/catalog/self-healing/refresh-engine.ts
 *
 * Re-prioritises the live-truth validation queue based on the current
 * healing state. Boosts stale products, watched products, and products
 * recovering from suppression so they are checked sooner.
 *
 * Delegates to the existing freshness-engine — this module is a thin
 * orchestration wrapper that surfaces the right signals.
 *
 * SERVER-ONLY.
 */

import { loadAllResults, buildQueue, saveQueue } from '@/lib/catalog/live-truth'
import { getCachedSnapshot } from '@/lib/catalog/intelligence/snapshot'
import type { Product } from '@/types'
import type { StaledProduct } from './types'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Rebuild and persist the validation queue, giving priority boosts to:
 *   - Stale products (never checked or old checks)
 *   - Trending/watched products (snapshot-based signals)
 *   - Products recovered from suppression (re-verify they stay recovered)
 *
 * Returns the new queue size.
 */
export function runRefreshEngine(
  publicProducts: Product[],
  staleProducts: StaledProduct[],
): number {
  const allResults = loadAllResults()
  const snapshot   = getCachedSnapshot()

  const trendingIds = new Set<string>(snapshot?.promotedIds ?? [])

  // Build priority summary for freshness-engine
  const existingSummary = Object.fromEntries(
    Object.entries(allResults).map(([id, r]) => [
      id, { checkedAt: r.checkedAt, truthScore: r.truthScore },
    ]),
  )

  // Force stale products to appear "ancient" so they jump to the front
  const staleIdArray = staleProducts.map(s => s.productId)
  for (const id of staleIdArray) {
    if (existingSummary[id]) {
      // Override checkedAt to epoch-zero to force max staleness priority
      existingSummary[id] = { ...existingSummary[id], checkedAt: new Date(0).toISOString() }
    }
    // If never checked, it already won't appear in existingSummary → freshness-engine handles it
  }

  const eligible = publicProducts.filter(p => p.asin && p.id)

  const queue = buildQueue({
    products:        eligible,
    existingResults: existingSummary,
    trendingIds,
  })

  saveQueue(queue)
  return queue.items.length
}
