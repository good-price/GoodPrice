/**
 * lib/catalog/live-truth/freshness-engine.ts
 *
 * Computes revalidation priority for each product and maintains the
 * ordered validation queue.
 *
 * Priority formula (higher = sooner):
 *
 *   Staleness      (0–50 pts): never checked = 50; each day stale adds ~7 pts
 *   Watched        (+30 pts):  product is in users' watchlists
 *   Trending       (+20 pts):  product is in the intelligence promotedIds
 *   Top seller     (+15 pts):  product.isTopSeller
 *   Low truth score (+0–15 pts): 50 - lastScore (capped)
 *   Click signal   (+0–10 pts): from intelligence rank data
 *
 * Products are stored in a JSON queue file and re-built on each run.
 */

import type { QueueItem, ValidationQueue } from './types'
import type { Product } from '@/types'

// ── Priority computation ──────────────────────────────────────────────────────

interface PrioritySignals {
  isWatched?:     boolean
  isTrending?:    boolean
  isTopSeller?:   boolean
  lastTruthScore?: number
  rankScore?:      number   // 0–1 from intelligence snapshot
}

export function computePriority(
  lastCheckedAt: string | null,
  signals:       PrioritySignals,
): number {
  let priority = 0

  // Staleness (never checked = max points)
  if (!lastCheckedAt) {
    priority += 50
  } else {
    const ageDays = (Date.now() - new Date(lastCheckedAt).getTime()) / (1_000 * 60 * 60 * 24)
    priority += Math.min(50, Math.round(ageDays * 7))
  }

  // Engagement bonuses
  if (signals.isWatched)  priority += 30
  if (signals.isTrending) priority += 20
  if (signals.isTopSeller) priority += 15

  // Low truth score = urgent re-check
  if (signals.lastTruthScore !== undefined) {
    const deficit = Math.max(0, 50 - signals.lastTruthScore)
    priority += Math.min(15, Math.round(deficit / 5))
  }

  // Intelligence rank
  if (signals.rankScore !== undefined) {
    priority += Math.round(signals.rankScore * 10)
  }

  return priority
}

// ── Queue building ────────────────────────────────────────────────────────────

export interface QueueBuildOptions {
  products:        Product[]
  existingResults: Record<string, { checkedAt: string; truthScore: number }>
  watchedIds?:     Set<string>
  trendingIds?:    Set<string>
}

/**
 * Builds a fresh, priority-sorted revalidation queue from all public products.
 * Call this once after each batch run to update the queue file.
 */
export function buildQueue(opts: QueueBuildOptions): ValidationQueue {
  const { products, existingResults, watchedIds = new Set(), trendingIds = new Set() } = opts

  const items: QueueItem[] = products
    .filter(p => p.asin && p.id)
    .map(p => {
      const prev = p.id ? existingResults[p.id] : undefined
      const priority = computePriority(prev?.checkedAt ?? null, {
        isWatched:     p.id ? watchedIds.has(p.id)   : false,
        isTrending:    p.id ? trendingIds.has(p.id)  : false,
        isTopSeller:   p.isTopSeller ?? false,
        lastTruthScore: prev?.truthScore,
      })

      let reason = 'routine'
      if (!prev)              reason = 'never_checked'
      else if (p.id && watchedIds.has(p.id)) reason = 'watched'
      else if (p.id && trendingIds.has(p.id)) reason = 'trending'

      return {
        productId:     p.id!,
        asin:          p.asin!,
        priority,
        lastCheckedAt: prev?.checkedAt ?? null,
        reason,
      } satisfies QueueItem
    })

  // Sort highest priority first
  items.sort((a, b) => b.priority - a.priority)

  return {
    updatedAt: new Date().toISOString(),
    items,
  }
}

/**
 * Returns the next N items from the queue that are due for revalidation.
 * "Due" = either never checked, or checked more than minIntervalHours ago.
 */
export function dequeueNext(
  queue:             ValidationQueue,
  limit:             number,
  minIntervalHours:  number = 6,
): QueueItem[] {
  const cutoff = Date.now() - minIntervalHours * 60 * 60 * 1_000

  return queue.items
    .filter(item => {
      if (!item.lastCheckedAt) return true
      return new Date(item.lastCheckedAt).getTime() < cutoff
    })
    .slice(0, limit)
}
