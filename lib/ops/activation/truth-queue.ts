/**
 * lib/ops/activation/truth-queue.ts
 *
 * Reads the Live Truth validation queue and produces an operational
 * status summary for the Recovery Center.
 *
 * SERVER-ONLY.
 */

import { loadQueue } from '@/lib/catalog/live-truth/reports'
import type { TruthQueueStatus, TruthQueueItem } from './types'

const STALE_HOURS    = 48   // items not checked in >48h are "stale"
const BACKLOG_THRESHOLD = 20  // pending > 20 = backlog

// ── Public API ────────────────────────────────────────────────────────────────

export function getTruthQueueStatus(): TruthQueueStatus {
  let queue = { updatedAt: '', items: [] as { productId: string; asin: string; priority: number; lastCheckedAt: string | null; reason: string }[] }

  try {
    queue = loadQueue()
  } catch { /* queue not initialized */ }

  const now = Date.now()

  const items: TruthQueueItem[] = queue.items.map(item => {
    const lastCheckedMs = item.lastCheckedAt
      ? new Date(item.lastCheckedAt).getTime()
      : 0
    const ageHours = lastCheckedMs
      ? Math.round((now - lastCheckedMs) / 3_600_000)
      : 9999

    return {
      productId:     item.productId,
      asin:          item.asin,
      priority:      item.priority,
      lastCheckedAt: item.lastCheckedAt,
      ageHours,
      reason:        item.reason,
    }
  }).sort((a, b) => b.priority - a.priority)

  const pending      = items.length
  const highPriority = items.filter(i => i.priority >= 70).length
  const stale        = items.filter(i => i.ageHours > STALE_HOURS).length
  const backlog      = pending > BACKLOG_THRESHOLD

  return {
    computedAt:   new Date().toISOString(),
    pending,
    highPriority,
    stale,
    backlog,
    items:        items.slice(0, 10),   // top 10 for display
  }
}
