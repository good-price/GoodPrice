/**
 * lib/ops/actions/bulk-actions.ts
 *
 * Bulk operations on multiple products simultaneously.
 * Also manages the action queue for pipeline-type actions.
 *
 * Bulk operations:
 *   - Execute the same action on a list of product IDs
 *   - Report per-product success/failure
 *   - Stop at MAX_BULK per request to prevent abuse
 *
 * Action queue:
 *   - Pipeline actions (repair, revalidate, etc.) are enqueued here
 *   - The ops job-runner picks them up during the next pipeline run
 *   - Storage: data/ops/actions/queue.json
 *
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { executeProductAction }    from './product-actions'
import type {
  ProductAction,
  BulkActionResult,
  QueuedAction,
  ActionQueue,
  QueuedActionType,
} from './types'

// ── Queue path ─────────────────────────────────────────────────────────────────

const QUEUE_PATH = join(process.cwd(), 'data', 'ops', 'actions', 'queue.json')
const MAX_QUEUE  = 500
const MAX_BULK   = 100

// ── Queue I/O ──────────────────────────────────────────────────────────────────

function ensureDir(): void {
  const dir = dirname(QUEUE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readQueue(): ActionQueue {
  ensureDir()
  if (!existsSync(QUEUE_PATH)) return { updatedAt: '', items: [] }
  try {
    return JSON.parse(readFileSync(QUEUE_PATH, 'utf8')) as ActionQueue
  } catch {
    return { updatedAt: '', items: [] }
  }
}

function writeQueue(queue: ActionQueue): void {
  ensureDir()
  const tmp = QUEUE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(queue, null, 2), 'utf8')
  renameSync(tmp, QUEUE_PATH)
}

// ── Queue API ──────────────────────────────────────────────────────────────────

/**
 * Adds a pipeline-type action to the action queue.
 */
export function enqueueAction(
  productId:  string,
  asin:       string,
  actionType: QueuedActionType,
  operator:   string,
  reason?:    string,
): QueuedAction {
  const queue = readQueue()
  const item: QueuedAction = {
    id:          `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId,
    asin,
    actionType,
    operator,
    reason,
    queuedAt:    new Date().toISOString(),
    status:      'pending',
  }

  // Remove previous pending item for same product+action (dedup)
  queue.items = queue.items.filter(
    i => !(i.productId === productId && i.actionType === actionType && i.status === 'pending')
  )

  queue.items = [item, ...queue.items].slice(0, MAX_QUEUE)
  queue.updatedAt = item.queuedAt
  writeQueue(queue)
  return item
}

/**
 * Returns all pending items in the queue.
 */
export function getPendingQueueItems(): QueuedAction[] {
  return readQueue().items.filter(i => i.status === 'pending')
}

/**
 * Returns the pending action type for a product, or null.
 */
export function getPendingActionForProduct(productId: string): QueuedActionType | null {
  const items = readQueue().items.filter(
    i => i.productId === productId && i.status === 'pending'
  )
  return items[0]?.actionType ?? null
}

/**
 * Marks a queue item as started.
 */
export function markQueueItemStarted(id: string): void {
  const queue = readQueue()
  const item  = queue.items.find(i => i.id === id)
  if (item) {
    item.status    = 'running'
    item.startedAt = new Date().toISOString()
    queue.updatedAt = item.startedAt
    writeQueue(queue)
  }
}

/**
 * Marks a queue item as done or failed.
 */
export function markQueueItemDone(id: string, failed = false): void {
  const queue = readQueue()
  const item  = queue.items.find(i => i.id === id)
  if (item) {
    item.status      = failed ? 'failed' : 'done'
    item.completedAt = new Date().toISOString()
    queue.updatedAt  = item.completedAt
    writeQueue(queue)
  }
}

// ── Bulk executor ──────────────────────────────────────────────────────────────

/**
 * Executes the same action on a list of product IDs.
 * Runs sequentially to avoid race conditions on shared files.
 */
export async function executeBulkAction(
  productIds: string[],
  action:     ProductAction,
  operator:   string,
  reason:     string,
  options:    Record<string, unknown> = {},
): Promise<BulkActionResult> {
  const ids   = productIds.slice(0, MAX_BULK)
  const total = ids.length

  let succeeded = 0
  let failed    = 0
  const results = []

  for (const productId of ids) {
    const result = await executeProductAction(productId, action, operator, reason, options)
    results.push(result)
    if (result.ok) succeeded++
    else failed++
  }

  return {
    ok:        failed === 0,
    action,
    total,
    succeeded,
    failed,
    results,
  }
}
