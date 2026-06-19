/**
 * lib/ops/workers/worker-colombia-audit.ts
 *
 * Worker for the 'colombia-audit' cycle stage.
 *
 * Two-pass detection:
 *   Pass 1 — Catalog fields (instant, no HTTP): resolves products where
 *             shipsToColombiaConfirmed is explicitly true or false.
 *   Pass 2 — Live Amazon page check: resolves remaining products.
 *
 * Auto-quarantines products with ≥ 2 consecutive unavailable checks.
 *
 * Cycle-context parameters:
 *   maxProducts=15 — smaller batch than the 20-product API default
 *   concurrency=3  — parallel requests (same as API route)
 *   delayMs=800    — ms between batches (same as API route)
 *
 * Corresponds to: POST /api/catalog/colombia-audit/run
 *
 * SERVER-ONLY.
 */

import { getColombiaProducts }           from '@/data/catalog'
import { isValidAsinFormat }             from '@/lib/catalog/validator'
import {
  loadColombiaCache,
  saveColombiaCache,
  checkColombiaAvailability,
  type ColombiaAvailabilityEntry,
  type ColombiaAvailabilityCache,
}                                        from '@/lib/catalog/colombia-availability'
import { bulkQuarantine, isQuarantined } from '@/lib/audit/quarantine'
import { runBatched }                    from './executor'
import type { OpsWorker, OpsWorkerResult } from './types'

// ── Cycle-context limits ──────────────────────────────────────────────────────

const CYCLE_MAX_PRODUCTS = 15
const CYCLE_CONCURRENCY  = 3
const CYCLE_DELAY_MS     = 800

// ── Worker ────────────────────────────────────────────────────────────────────

export const colombiaAuditWorker: OpsWorker = async (): Promise<OpsWorkerResult> => {
  const startMs   = Date.now()
  const now       = new Date().toISOString()

  const allEligible = getColombiaProducts()
    .filter(p => p.asin && isValidAsinFormat(p.asin) && p.status !== 'inactive')

  const existing = loadColombiaCache()
  const entries: Record<string, ColombiaAvailabilityEntry> = existing?.entries ? { ...existing.entries } : {}

  let catalogFieldResolved = 0
  let countAvailable       = 0
  let countUnavailable     = 0
  let countRateLimited     = 0
  let liveChecked          = 0

  // ── Pass 1: resolve from catalog fields ────────────────────────────────────

  for (const product of allEligible) {
    const id = product.id
    if (product.shipsToColombiaConfirmed === false) {
      const prev  = entries[id]
      const cFail = (prev?.status === 'unavailable' ? (prev.consecutiveFails ?? 0) : 0) + 1
      entries[id] = {
        productId:            id,
        asin:                 product.asin!,
        status:               'unavailable',
        source:               'catalog-field',
        httpStatus:           null,
        checkedAt:            now,
        consecutiveFails:     cFail,
        amazonGlobalEligible: false,
        hasImportFees:        false,
        restrictionSignals:   ['shipsToColombiaConfirmed: false'],
        failureReason:        'Catálogo indica que el producto no envía a Colombia',
      }
      countUnavailable++
      catalogFieldResolved++
    } else if (product.shipsToColombiaConfirmed === true) {
      entries[id] = {
        productId:            id,
        asin:                 product.asin!,
        status:               'available',
        source:               'catalog-field',
        httpStatus:           null,
        checkedAt:            now,
        consecutiveFails:     0,
        amazonGlobalEligible: true,
        hasImportFees:        null,
        restrictionSignals:   [],
        failureReason:        null,
      }
      countAvailable++
      catalogFieldResolved++
    }
  }

  // ── Pass 2: live-check remaining products ──────────────────────────────────

  const liveCandidates = allEligible.filter(
    p => p.shipsToColombiaConfirmed === undefined || p.shipsToColombiaConfirmed === null,
  )
  const liveSlice = liveCandidates.slice(0, CYCLE_MAX_PRODUCTS)

  type QuarantineCandidate = { productId: string; asin: string; title: string; category: string; consecutiveFails: number }
  const quarantineCandidates: QuarantineCandidate[] = []

  await runBatched(liveSlice, CYCLE_CONCURRENCY, CYCLE_DELAY_MS, async (product) => {
    const id   = product.id
    const asin = product.asin!
    try {
      const result           = await checkColombiaAvailability(asin)
      const prev             = entries[id]
      const wasUnavailable   = prev?.status === 'unavailable'
      const isUnavailableNow = result.status === 'unavailable'
      const consecutiveFails = isUnavailableNow
        ? ((wasUnavailable ? (prev.consecutiveFails ?? 0) : 0) + 1)
        : 0

      entries[id] = {
        productId:            id,
        asin,
        status:               result.status,
        source:               'live-check',
        httpStatus:           result.httpStatus,
        checkedAt:            now,
        consecutiveFails,
        amazonGlobalEligible: result.amazonGlobalEligible,
        hasImportFees:        result.hasImportFees,
        restrictionSignals:   result.restrictionSignals,
        failureReason:        result.failureReason,
      }

      switch (result.status) {
        case 'available':    countAvailable++;    break
        case 'unavailable':  countUnavailable++;  break
        case 'rate-limited': countRateLimited++;  break
        default:             break
      }

      if (isUnavailableNow && consecutiveFails >= 2) {
        quarantineCandidates.push({ productId: id, asin, title: product.title, category: product.category, consecutiveFails })
      }
    } catch {
      // Network failure — product stays as-is in entries (previous state preserved)
    }
    liveChecked++
  })

  // ── Persist cache ──────────────────────────────────────────────────────────

  const cache: ColombiaAvailabilityCache = { generatedAt: now, entries }
  saveColombiaCache(cache)

  // ── Auto-quarantine ────────────────────────────────────────────────────────

  const removedAsins: string[] = []

  if (quarantineCandidates.length > 0) {
    const toQuarantine = quarantineCandidates.filter(p => !isQuarantined(p.productId))
    if (toQuarantine.length > 0) {
      bulkQuarantine(
        toQuarantine.map(p => ({
          productId:     p.productId,
          asin:          p.asin,
          title:         p.title,
          category:      p.category,
          reason:        `No disponible para Colombia — ${p.consecutiveFails} auditorías consecutivas sin disponibilidad`,
          quarantinedBy: 'audit' as const,
        })),
      )
      removedAsins.push(...toQuarantine.map(p => p.asin))
    }
  }

  const durationMs = Date.now() - startMs

  const flaggedAsins = quarantineCandidates
    .filter(p => !removedAsins.includes(p.asin))
    .map(p => p.asin)

  return {
    success: true,
    summary: [
      `Colombia-audit:`,
      `${catalogFieldResolved} resolved from catalog,`,
      `${liveChecked} live-checked,`,
      `${countAvailable} available,`,
      `${countUnavailable} unavailable.`,
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
