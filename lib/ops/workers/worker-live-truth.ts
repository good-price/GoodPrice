/**
 * lib/ops/workers/worker-live-truth.ts
 *
 * Worker for the 'live-truth' cycle stage.
 *
 * Validates the next N products in the live-truth queue against Amazon pages.
 * Updates validation results, rebuilds the report, and refreshes the queue.
 *
 * Cycle-context parameters:
 *   limit=5      — small batch to stay within timeoutMs and respect Amazon rate limits
 *   delayMs=1500 — inter-product delay (slightly faster than the 2000ms API default)
 *   minIntervalHours=4 — cycle runs daily, so products checked within 4h are skipped
 *
 * Corresponds to: POST /api/catalog/live-truth/run
 *
 * SERVER-ONLY.
 */

import { getPublicProducts }       from '@/lib/catalog/public'
import { getCachedSnapshot }       from '@/lib/catalog/intelligence/snapshot'
import {
  validateProduct,
  loadAllResults,
  loadProductHistory,
  saveResult,
  cacheResult,
  buildReport,
  saveReport,
  buildQueue,
  dequeueNext,
  saveQueue,
}                                  from '@/lib/catalog/live-truth'
import type { OpsWorker, OpsWorkerResult } from './types'

// ── Cycle-context limits ──────────────────────────────────────────────────────

const CYCLE_LIMIT         = 5     // products per cycle run
const CYCLE_DELAY_MS      = 1500  // ms between Amazon requests
const CYCLE_MIN_INTERVAL  = 4     // skip products checked within 4 hours

// ── Worker ─────────────────────────────────────────────────────────────────────

export const liveTruthWorker: OpsWorker = async (): Promise<OpsWorkerResult> => {
  const startMs         = Date.now()
  const publicProducts  = getPublicProducts()
  const existingResults = loadAllResults()

  // Build queue and select the next batch of due products
  const snapshot    = getCachedSnapshot()
  const trendingIds = new Set<string>(snapshot?.promotedIds ?? [])
  const existingSummary = Object.fromEntries(
    Object.entries(existingResults).map(([id, r]) => [
      id, { checkedAt: r.checkedAt, truthScore: r.truthScore },
    ]),
  )

  const queue    = buildQueue({ products: publicProducts.filter(p => p.asin && p.id), existingResults: existingSummary, trendingIds })
  const due      = dequeueNext(queue, CYCLE_LIMIT, CYCLE_MIN_INTERVAL)
  const toValidate = due
    .map(item => publicProducts.find(p => p.id === item.productId))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)

  if (toValidate.length === 0) {
    return {
      success: true,
      summary: 'Live-truth: no products due for validation in this cycle.',
      actions: { removed: [], repaired: [], suppressed: [], recovered: [], flagged: [] },
      warnings: ['No products due for live validation (all checked recently).'],
      errors:   [],
    }
  }

  // ── Validate each product ─────────────────────────────────────────────────

  const flagged:  string[] = []
  const warnings: string[] = []
  const errors:   string[] = []
  let   checked = 0

  for (let i = 0; i < toValidate.length; i++) {
    const product = toValidate[i]
    if (!product.id || !product.asin) continue

    try {
      const history       = loadProductHistory(product.id)
      const prevCheckedAt = existingResults[product.id]?.checkedAt ?? null

      const result = await validateProduct(product, history, prevCheckedAt)

      saveResult(result)
      cacheResult(result)
      checked++

      if (result.status !== 'valid') {
        flagged.push(product.asin)
      }
    } catch (err) {
      const msg = `Failed to validate ${product.asin}: ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
    }

    // Delay between requests (skip after the last item)
    if (i < toValidate.length - 1) {
      await new Promise<void>(r => setTimeout(r, CYCLE_DELAY_MS))
    }
  }

  // ── Rebuild report and queue ──────────────────────────────────────────────

  const allResults = loadAllResults()
  const report     = buildReport(allResults, publicProducts.length)
  saveReport(report)

  const updatedSummary = Object.fromEntries(
    Object.entries(allResults).map(([id, r]) => [id, { checkedAt: r.checkedAt, truthScore: r.truthScore }]),
  )
  const updatedQueue = buildQueue({
    products:        publicProducts.filter(p => p.asin && p.id),
    existingResults: updatedSummary,
    trendingIds,
  })
  saveQueue(updatedQueue)

  const durationMs = Date.now() - startMs

  return {
    success: errors.length === 0 || checked > 0,
    summary: [
      `Live-truth:`,
      `${checked}/${toValidate.length} validated,`,
      `${flagged.length} flagged.`,
      `avgScore=${report.avgTruthScore ?? 0}.`,
      `queueSize=${updatedQueue.items.length}.`,
      `durationMs=${durationMs}.`,
    ].join(' '),
    actions: {
      removed:    [],
      repaired:   [],
      suppressed: [],
      recovered:  [],
      flagged,
    },
    warnings,
    errors,
  }
}
