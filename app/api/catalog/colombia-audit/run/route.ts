/**
 * POST /api/catalog/colombia-audit/run
 *
 * Background audit that validates Colombia shipping availability for every
 * product in the eligible catalog. Persists results to
 * data/catalog/colombia-availability.json so Gate 10 in lib/catalog/public.ts
 * can suppress unavailable products on the next cold-start / ISR cycle.
 *
 * Authentication: requires { secret: process.env.AUDIT_SECRET } in request body.
 *
 * Two-pass detection:
 *   Pass 1 — Catalog fields (instant, no HTTP):
 *     products with shipsToColombiaConfirmed === false → unavailable (source: catalog-field)
 *     products with shipsToColombiaConfirmed === true  → available   (source: catalog-field)
 *   Pass 2 — Live Amazon page check (HTTP, async):
 *     remaining products (shipsToColombiaConfirmed undefined) → live check
 *
 * Request body (JSON):
 *   secret           string  — required (AUDIT_SECRET env var)
 *   maxProducts      number  — max products for live check per run (default: 20)
 *   offset           number  — skip first N live-check candidates (default: 0)
 *   dryRun           boolean — check but do NOT save results (default: false)
 *   skipCatalogPass  boolean — skip pass 1 (live-check only mode, default: false)
 *
 * Response body (JSON):
 *   ok                    boolean
 *   dryRun                boolean
 *   catalogFieldResolved  number   — products resolved from catalog fields (pass 1)
 *   liveChecked           number   — products live-checked (pass 2)
 *   available             number
 *   unavailable           number
 *   rateLimited           number
 *   unknown               number
 *   autoQuarantined       number
 *   durationMs            number
 *
 * Performance notes:
 *   - Pass 1 is instantaneous (catalog field reads, no HTTP)
 *   - Pass 2 concurrency: 3 parallel requests, 9 s timeout, 800 ms batch delay
 *   - Default maxProducts (pass 2): 20 → worst-case ~30 s
 *   - Use offset to paginate over large catalogs
 *
 * Recommended cron: daily at 5 AM Colombia time (10 AM UTC): 0 10 * * *
 */

import { NextRequest, NextResponse } from 'next/server'
import { getColombiaProducts } from '@/data/catalog'
import { isValidAsinFormat } from '@/lib/catalog/validator'
import {
  loadColombiaCache,
  saveColombiaCache,
  checkColombiaAvailability,
  type ColombiaAvailabilityEntry,
  type ColombiaAvailabilityCache,
} from '@/lib/catalog/colombia-availability'
import { bulkQuarantine, isQuarantined } from '@/lib/audit/quarantine'

// Allow up to 60 seconds (Vercel Pro / extended timeout)
export const maxDuration = 60

// ── Concurrency helper ────────────────────────────────────────────────────────

async function runBatched<T, R>(
  items:       T[],
  concurrency: number,
  delayMs:     number,
  fn:          (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    if (i + concurrency < items.length && delayMs > 0) {
      await new Promise<void>(r => setTimeout(r, delayMs))
    }
  }
  return results
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { /* no body */ }

  const secret = process.env.AUDIT_SECRET
  if (secret && body.secret !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // ── Options ───────────────────────────────────────────────────────────────
  const maxProducts     = typeof body.maxProducts     === 'number'  ? Math.max(1, Math.min(body.maxProducts, 50)) : 20
  const offset          = typeof body.offset          === 'number'  ? Math.max(0, body.offset)                    : 0
  const dryRun          = body.dryRun         === true
  const skipCatalogPass = body.skipCatalogPass === true

  const startTime = Date.now()

  // ── Load all Colombia-eligible products ───────────────────────────────────
  const allEligible = getColombiaProducts()
    .filter(p => p.asin && isValidAsinFormat(p.asin) && p.status !== 'inactive')

  // Load existing cache to preserve entries from previous runs
  const existing = loadColombiaCache()
  const entries: Record<string, ColombiaAvailabilityEntry> = existing?.entries
    ? { ...existing.entries }
    : {}

  const now = new Date().toISOString()
  let catalogFieldResolved = 0
  let liveChecked          = 0
  let countAvailable       = 0
  let countUnavailable     = 0
  let countRateLimited     = 0
  let countUnknown         = 0

  // ── Pass 1: resolve from catalog fields (no HTTP) ─────────────────────────
  if (!skipCatalogPass) {
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
  }

  // ── Pass 2: live-check products without a confirmed catalog value ──────────
  // Only candidates: products where shipsToColombiaConfirmed is undefined/null
  const liveCandidates = allEligible.filter(
    p => p.shipsToColombiaConfirmed === undefined || p.shipsToColombiaConfirmed === null
  )
  const liveSlice = liveCandidates.slice(offset, offset + maxProducts)

  type QuarantineCandidate = {
    productId:        string
    asin:             string
    title:            string
    category:         string
    consecutiveFails: number
  }
  const quarantineCandidates: QuarantineCandidate[] = []

  await runBatched(liveSlice, 3, 800, async (product) => {
    const id     = product.id
    const asin   = product.asin!
    const result = await checkColombiaAvailability(asin)

    const prev            = entries[id]
    const wasUnavailable  = prev?.status === 'unavailable'
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
      default:             countUnknown++;      break
    }

    if (isUnavailableNow && consecutiveFails >= 2) {
      quarantineCandidates.push({
        productId: id, asin, title: product.title, category: product.category, consecutiveFails,
      })
    }

    liveChecked++
    console.log(
      `[colombia-audit] ${asin} → ${result.status}` +
      (result.failureReason ? ` (${result.failureReason.slice(0, 60)})` : '')
    )
  })

  // ── Persist cache ─────────────────────────────────────────────────────────
  const cache: ColombiaAvailabilityCache = { generatedAt: now, entries }

  if (!dryRun) {
    saveColombiaCache(cache)
  }

  // ── Auto-quarantine products with ≥ 2 consecutive unavailable checks ───────
  let autoQuarantined = 0

  if (!dryRun && quarantineCandidates.length > 0) {
    const toQuarantine = quarantineCandidates.filter(p => !isQuarantined(p.productId))

    if (toQuarantine.length > 0) {
      const result = bulkQuarantine(
        toQuarantine.map(p => ({
          productId:     p.productId,
          asin:          p.asin,
          title:         p.title,
          category:      p.category,
          reason:        `No disponible para Colombia — ${p.consecutiveFails} auditorías consecutivas sin disponibilidad`,
          quarantinedBy: 'audit' as const,
        }))
      )
      autoQuarantined = result.added
      if (autoQuarantined > 0) {
        console.warn(
          `[colombia-audit] Auto-quarantined ${autoQuarantined} product(s) with ≥2 consecutive Colombia unavailable`
        )
      }
    }
  }

  return NextResponse.json({
    ok:                   true,
    dryRun,
    catalogFieldResolved,
    liveChecked,
    available:            countAvailable,
    unavailable:          countUnavailable,
    rateLimited:          countRateLimited,
    unknown:              countUnknown,
    autoQuarantined,
    offset,
    totalLiveCandidates:  liveCandidates.length,
    durationMs:           Date.now() - startTime,
  })
}
