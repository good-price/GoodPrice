/**
 * lib/ops/workers/worker-link-audit.ts
 *
 * Worker for the 'link-audit' cycle stage.
 *
 * Validates Amazon product page reachability for Colombia-eligible products.
 * Persists results to data/catalog/link-health.json and auto-quarantines
 * products with ≥ 2 consecutive dead-link failures.
 *
 * Cycle-context parameters:
 *   maxProducts=15 — smaller batch than the 20-product API default
 *   concurrency=3  — parallel requests (same as API route)
 *   delayMs=800    — ms between batches (same as API route)
 *
 * Corresponds to: POST /api/catalog/link-audit/run
 *
 * SERVER-ONLY.
 */

import { getColombiaProducts }         from '@/data/catalog'
import { isValidAsinFormat }           from '@/lib/catalog/validator'
import {
  loadLinkHealthCache,
  saveLinkHealthCache,
  checkAmazonLink,
  type LinkHealthEntry,
  type LinkHealthCache,
}                                      from '@/lib/catalog/link-health'
import { bulkQuarantine, isQuarantined } from '@/lib/audit/quarantine'
import { runBatched }                  from './executor'
import type { OpsWorker, OpsWorkerResult } from './types'

// ── Cycle-context limits ──────────────────────────────────────────────────────

const CYCLE_MAX_PRODUCTS = 15
const CYCLE_CONCURRENCY  = 3
const CYCLE_DELAY_MS     = 800

// ── Worker ────────────────────────────────────────────────────────────────────

export const linkAuditWorker: OpsWorker = async (): Promise<OpsWorkerResult> => {
  const startMs  = Date.now()

  const eligible = getColombiaProducts()
    .filter(p => p.asin && isValidAsinFormat(p.asin) && p.status !== 'inactive')

  const products = eligible.slice(0, CYCLE_MAX_PRODUCTS)

  const existing = loadLinkHealthCache()
  const entries: Record<string, LinkHealthEntry> = existing?.entries ? { ...existing.entries } : {}

  let countAlive = 0, countDead = 0, countRateLimited = 0

  type DeadProduct = { productId: string; asin: string; title: string; category: string; consecutiveFails: number }
  const deadProducts: DeadProduct[] = []

  await runBatched(products, CYCLE_CONCURRENCY, CYCLE_DELAY_MS, async (product) => {
    const id   = product.id
    const asin = product.asin!

    try {
      const result        = await checkAmazonLink(asin)
      const prev          = entries[id]
      const wasDeadBefore = prev?.status === 'dead'
      const isDeadNow     = result.status === 'dead'
      const consecutiveFails = isDeadNow
        ? ((wasDeadBefore ? (prev.consecutiveFails ?? 0) : 0) + 1)
        : 0

      entries[id] = {
        productId:        id,
        asin,
        status:           result.status,
        httpStatus:       result.httpStatus,
        checkedAt:        new Date().toISOString(),
        consecutiveFails,
        failureReason:    result.failureReason,
        redirectTarget:   result.redirectTarget,
      }

      switch (result.status) {
        case 'alive':        countAlive++;        break
        case 'dead':         countDead++;         break
        case 'rate-limited': countRateLimited++;  break
        default:             break
      }

      if (isDeadNow && consecutiveFails >= 2) {
        deadProducts.push({ productId: id, asin, title: product.title, category: product.category, consecutiveFails })
      }
    } catch {
      // Network failure — product stays as-is in entries (previous state preserved)
    }
  })

  // ── Persist results ───────────────────────────────────────────────────────

  const cache: LinkHealthCache = { generatedAt: new Date().toISOString(), entries }
  saveLinkHealthCache(cache)

  // ── Auto-quarantine ───────────────────────────────────────────────────────

  const removedAsins: string[] = []

  if (deadProducts.length > 0) {
    const toQuarantine = deadProducts.filter(p => !isQuarantined(p.productId))
    if (toQuarantine.length > 0) {
      bulkQuarantine(
        toQuarantine.map(p => ({
          productId:     p.productId,
          asin:          p.asin,
          title:         p.title,
          category:      p.category,
          reason:        `Enlace Amazon inaccesible — ${p.consecutiveFails} auditorías consecutivas fallidas`,
          quarantinedBy: 'audit' as const,
        })),
      )
      removedAsins.push(...toQuarantine.map(p => p.asin))
    }
  }

  const durationMs = Date.now() - startMs

  const flaggedAsins = deadProducts
    .filter(p => !removedAsins.includes(p.asin))
    .map(p => p.asin)

  return {
    success: true,
    summary: [
      `Link-audit:`,
      `${products.length} checked,`,
      `${countAlive} alive,`,
      `${countDead} dead,`,
      `${countRateLimited} rate-limited.`,
      `autoQuarantined=${removedAsins.length}.`,
      `durationMs=${durationMs}.`,
    ].join(' '),
    actions: {
      removed:    removedAsins,
      repaired:   [],
      suppressed: [],
      recovered:  [],
      flagged:    flaggedAsins,
    },
    warnings: countRateLimited > 0 ? [`${countRateLimited} products rate-limited by Amazon — not suppressed`] : [],
    errors:   [],
  }
}
