/**
 * POST /api/catalog/live-truth/run
 *
 * Triggers a live validation batch for the next N products in the queue.
 * Each product is fetched from Amazon and validated. Results are persisted
 * to data/catalog/live-truth/ and the queue is updated.
 *
 * Auth: AUDIT_SECRET (same as other catalog admin endpoints)
 *
 * Body (all optional):
 *   {
 *     limit?:          number    // products per batch  (default: 5, max: 20)
 *     productIds?:     string[]  // validate specific IDs (skips queue)
 *     minIntervalHours?: number  // skip recently checked products (default: 6)
 *     delayMs?:        number    // delay between requests (default: 2000ms)
 *   }
 *
 * Response:
 *   {
 *     ok:      boolean
 *     checked: number
 *     results: { productId, asin, status, truthScore, confidence, issues }[]
 *     queueSize: number
 *     durationMs: number
 *   }
 *
 * Anti-bot resilience: each product request is separated by a configurable
 * delay (default 2 s). Keep batches small (≤ 10) to avoid rate limiting.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin/auth'
import { getPublicProducts } from '@/lib/catalog/public'
import { getCachedSnapshot } from '@/lib/catalog/intelligence/snapshot'
import {
  validateProduct,
  loadAllResults,
  loadProductHistory,
  saveResult,
  buildReport,
  saveReport,
  buildQueue,
  dequeueNext,
  saveQueue,
  cacheResult,
} from '@/lib/catalog/live-truth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Longer timeout — fetching Amazon pages takes time
export const maxDuration = 300   // 5 minutes (Vercel Pro / self-hosted)

// ── Delay utility ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch { /* empty body is fine */ }

  const limit            = Math.min(Number(body.limit)            || 5,  20)
  const minIntervalHours = Math.max(Number(body.minIntervalHours) || 6,  1)
  const delayMs          = Math.min(Number(body.delayMs)          || 2_000, 5_000)
  const specificIds      = Array.isArray(body.productIds)
    ? (body.productIds as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 20)
    : null

  const startMs = Date.now()

  // ── Select products to validate ───────────────────────────────────────────
  const publicProducts = getPublicProducts()
  const existingResults = loadAllResults()

  let toValidate = publicProducts.filter(p => p.asin && p.id)

  if (specificIds && specificIds.length > 0) {
    toValidate = toValidate.filter(p => specificIds.includes(p.id!))
  } else {
    // Build a fresh queue and take the top N due items
    const snapshot = getCachedSnapshot()
    const trendingIds  = new Set<string>(snapshot?.promotedIds ?? [])
    const existingSummary = Object.fromEntries(
      Object.entries(existingResults).map(([id, r]) => [
        id, { checkedAt: r.checkedAt, truthScore: r.truthScore },
      ]),
    )

    const queue = buildQueue({
      products:        toValidate,
      existingResults: existingSummary,
      trendingIds,
    })
    saveQueue(queue)

    const due = dequeueNext(queue, limit, minIntervalHours)
    toValidate = due
      .map(item => toValidate.find(p => p.id === item.productId))
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
  }

  // Slice to limit
  toValidate = toValidate.slice(0, limit)

  // ── Validate each product ─────────────────────────────────────────────────
  const summaries: {
    productId: string
    asin:      string
    status:    string
    truthScore: number
    confidence: string
    issues:    string[]
  }[] = []

  for (let i = 0; i < toValidate.length; i++) {
    const product = toValidate[i]
    if (!product.id || !product.asin) continue

    try {
      const history = loadProductHistory(product.id)
      const prevCheckedAt = existingResults[product.id]?.checkedAt ?? null

      const result = await validateProduct(product, history, prevCheckedAt)

      // Persist
      saveResult(result)
      cacheResult(result)

      summaries.push({
        productId:  result.productId,
        asin:       result.asin,
        status:     result.status,
        truthScore: result.truthScore,
        confidence: result.confidence,
        issues:     result.issues,
      })
    } catch (err) {
      console.error(`[live-truth/run] Error validating ${product.asin}:`, err)
    }

    // Delay between requests (skip after last item)
    if (i < toValidate.length - 1) {
      await sleep(delayMs)
    }
  }

  // ── Rebuild and save report ───────────────────────────────────────────────
  const allResults = loadAllResults()
  const report     = buildReport(allResults, publicProducts.length)
  saveReport(report)

  // ── Rebuild queue with updated check times ────────────────────────────────
  const snapshot   = getCachedSnapshot()
  const trendingIds = new Set<string>(snapshot?.promotedIds ?? [])
  const updatedSummary = Object.fromEntries(
    Object.entries(allResults).map(([id, r]) => [
      id, { checkedAt: r.checkedAt, truthScore: r.truthScore },
    ]),
  )
  const updatedQueue = buildQueue({
    products:        publicProducts.filter(p => p.asin && p.id),
    existingResults: updatedSummary,
    trendingIds,
  })
  saveQueue(updatedQueue)

  return NextResponse.json({
    ok:          true,
    checked:     summaries.length,
    results:     summaries,
    queueSize:   updatedQueue.items.length,
    durationMs:  Date.now() - startMs,
    report: {
      totalChecked:    report.totalChecked,
      validCount:      report.validCount,
      driftedCount:    report.driftedCount,
      unavailableCount: report.unavailableCount,
      suspectCount:    report.suspectCount,
      avgTruthScore:   report.avgTruthScore,
    },
  })
}
