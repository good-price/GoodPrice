/**
 * lib/catalog/self-healing/stale-engine.ts
 *
 * Identifies catalog products that are stale and need priority revalidation.
 *
 * A product is stale if:
 *   - It has never been checked (no truth result)
 *   - It was last checked >14 days ago
 *   - It has a low truth score (<50) and was last checked >7 days ago
 *
 * The stale engine does NOT archive products — it only flags them so the
 * freshness engine can boost their queue priority.
 *
 * SERVER-ONLY.
 */

import { loadAllResults } from '@/lib/catalog/live-truth'
import type { Product } from '@/types'
import type { StaledProduct } from './types'

// ── Config ────────────────────────────────────────────────────────────────────

const STALE_DAYS            = 14   // >14d since last check → stale
const LOW_SCORE_STALE_DAYS  = 7    // >7d since last check AND score <50 → stale
const LOW_SCORE_THRESHOLD   = 50

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(isoDate: string | null): number {
  if (!isoDate) return Infinity
  return (Date.now() - new Date(isoDate).getTime()) / (1_000 * 60 * 60 * 24)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Identify stale products from the public catalog.
 * Returns StaledProduct[] sorted by staleness (most stale first).
 */
export function identifyStaleProducts(products: Product[]): StaledProduct[] {
  const allResults  = loadAllResults()
  const stale: StaledProduct[] = []

  for (const p of products) {
    if (!p.id || !p.asin) continue
    const result      = allResults[p.id]
    const checkedAt   = result?.checkedAt ?? null
    const truthScore  = result?.truthScore ?? 50   // assume neutral if never checked
    const days        = daysSince(checkedAt)

    let reason: StaledProduct['reason'] | null = null

    if (checkedAt === null) {
      reason = 'never_checked'
    } else if (days > STALE_DAYS) {
      reason = 'old_check'
    } else if (days > LOW_SCORE_STALE_DAYS && truthScore < LOW_SCORE_THRESHOLD) {
      reason = 'low_score_stale'
    }

    if (!reason) continue

    stale.push({
      productId:     p.id,
      asin:          p.asin,
      title:         p.title,
      lastCheckedAt: checkedAt,
      truthScore:    result?.truthScore ?? 0,
      staleDays:     days === Infinity ? -1 : Math.round(days),
      reason,
    })
  }

  // Sort: never_checked first, then by staleness desc
  stale.sort((a, b) => {
    if (a.reason === 'never_checked' && b.reason !== 'never_checked') return -1
    if (b.reason === 'never_checked' && a.reason !== 'never_checked') return  1
    return b.staleDays - a.staleDays
  })

  return stale
}
