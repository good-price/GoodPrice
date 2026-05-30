/**
 * lib/ops/queue-monitor.ts
 *
 * Monitors all processing queues in the GOODPRICE platform:
 *   1. Live truth validation queue  (data/catalog/live-truth/queue.json)
 *   2. Self-healing schedule        (data/catalog/live-truth/healing-schedule.json)
 *
 * Returns QueueStatus objects indicating size, staleness, and stall detection.
 *
 * SERVER-ONLY.
 */

import { loadQueue }              from '@/lib/catalog/live-truth'
import { getHealingSchedule }     from '@/lib/catalog/self-healing'
import type { QueueStatus }       from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

/** A queue is considered stalled if it hasn't been updated in this long. */
const VALIDATION_STALL_MS = 24 * 3_600_000   // 24h
const HEALING_STALL_MS    = 48 * 3_600_000   // 48h

function ageMs(iso: string | null | undefined): number {
  if (!iso) return Infinity
  return Date.now() - new Date(iso).getTime()
}

// ── Queue readers ─────────────────────────────────────────────────────────────

function getValidationQueueStatus(): QueueStatus {
  const queue = loadQueue()

  if (!queue) {
    return {
      name:           'Validación Live Truth',
      size:           0,
      oldestItemAt:   null,
      isStalled:      false,
      lastActivityAt: null,
    }
  }

  // Find the oldest item in the queue (lowest priority = most stale)
  const items       = queue.items ?? []
  const oldestItem  = items.reduce<typeof items[0] | null>((acc, item) => {
    if (!acc) return item
    const accAge  = ageMs(acc.lastCheckedAt)
    const itemAge = ageMs(item.lastCheckedAt)
    return itemAge > accAge ? item : acc
  }, null)

  const isStalled = ageMs(queue.updatedAt) > VALIDATION_STALL_MS && items.length > 0

  return {
    name:           'Validación Live Truth',
    size:           items.length,
    oldestItemAt:   oldestItem?.lastCheckedAt ?? null,
    isStalled,
    lastActivityAt: queue.updatedAt ?? null,
  }
}

function getHealingQueueStatus(): QueueStatus {
  const schedule = getHealingSchedule()

  const isStalled = !!schedule.lastCycleAt
    && ageMs(schedule.lastCycleAt) > HEALING_STALL_MS

  return {
    name:           'Auto-reparación',
    size:           0,    // healing has no explicit queue — it runs on all suppressed products
    oldestItemAt:   null,
    isStalled:      isStalled,
    lastActivityAt: schedule.lastCycleAt,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the status of all platform queues.
 */
export function getQueueStatuses(): QueueStatus[] {
  return [
    getValidationQueueStatus(),
    getHealingQueueStatus(),
  ]
}
