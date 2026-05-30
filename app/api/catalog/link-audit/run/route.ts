/**
 * POST /api/catalog/link-audit/run
 *
 * Background audit that validates Amazon product page reachability for every
 * product in the Colombia-eligible catalog. Persists results to
 * data/catalog/link-health.json so Gate 9 in lib/catalog/public.ts can
 * suppress dead-link products on the next cold-start / ISR cycle.
 *
 * Authentication: requires { secret: process.env.AUDIT_SECRET } in request body.
 *
 * Request body (JSON):
 *   secret       string  — required (AUDIT_SECRET env var)
 *   maxProducts  number  — max products to check per run (default: 20)
 *   dryRun       boolean — if true, checks but does NOT save results (default: false)
 *   offset       number  — skip first N products (for paginated runs, default: 0)
 *
 * Response body (JSON):
 *   ok                   boolean
 *   dryRun               boolean
 *   checked              number   — products actually checked
 *   alive                number
 *   dead                 number
 *   rateLimited          number
 *   unknown              number
 *   autoQuarantined      number   — products moved to quarantine (consecutiveFails ≥ 2)
 *   durationMs           number
 *
 * Performance notes:
 *   - Concurrency: 3 parallel requests
 *   - Per-request timeout: 9 s
 *   - Delay between batches: 800 ms (respectful to Amazon's rate limiter)
 *   - Default maxProducts: 20 → worst-case ~30 s (well inside 60 s Vercel limit)
 *   - Run multiple times with `offset` to cover larger catalogs
 *
 * Recommended cron: daily at 4 AM Colombia time (9 AM UTC): 0 9 * * *
 * For a 200-product catalog run in batches of 20: schedule 10 runs offset 0..180
 *
 * Auto-quarantine:
 *   Products with consecutiveFails ≥ 2 are automatically moved to
 *   data/audit/quarantine.json using bulkQuarantine() with quarantinedBy='audit'.
 *   Already-quarantined products are skipped (not re-quarantined).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getColombiaProducts } from '@/data/catalog'
import { isValidAsinFormat } from '@/lib/catalog/validator'
import {
  loadLinkHealthCache,
  saveLinkHealthCache,
  checkAmazonLink,
  type LinkHealthEntry,
  type LinkHealthCache,
} from '@/lib/catalog/link-health'
import { bulkQuarantine, isQuarantined } from '@/lib/audit/quarantine'

// Allow up to 60 seconds for this route (Vercel Pro / hobby with extended timeout)
export const maxDuration = 60

// ── Concurrency helper ────────────────────────────────────────────────────────

/**
 * Runs `fn` over `items` with at most `concurrency` simultaneous executions.
 * Waits `delayMs` between batches.
 */
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
  const maxProducts = typeof body.maxProducts === 'number' ? Math.max(1, Math.min(body.maxProducts, 50)) : 20
  const offset      = typeof body.offset === 'number'      ? Math.max(0, body.offset)                    : 0
  const dryRun      = body.dryRun === true

  const startTime   = Date.now()

  // ── Build product pool ────────────────────────────────────────────────────
  // Check Colombia-eligible, non-inactive products with valid ASINs —
  // exactly the products that Gates 1–4 allow through.
  const eligible = getColombiaProducts()
    .filter(p => p.asin && isValidAsinFormat(p.asin) && p.status !== 'inactive')

  const products = eligible.slice(offset, offset + maxProducts)

  if (products.length === 0) {
    return NextResponse.json({
      ok:             true,
      dryRun,
      checked:        0,
      alive:          0,
      dead:           0,
      rateLimited:    0,
      unknown:        0,
      autoQuarantined: 0,
      durationMs:     Date.now() - startTime,
      note:           `No eligible products at offset ${offset} (total eligible: ${eligible.length})`,
    })
  }

  // ── Load existing cache ───────────────────────────────────────────────────
  const existing = loadLinkHealthCache()
  const entries: Record<string, LinkHealthEntry> = existing?.entries
    ? { ...existing.entries }
    : {}

  // ── Check each product ────────────────────────────────────────────────────
  let countAlive = 0, countDead = 0, countRateLimited = 0, countUnknown = 0

  type CheckedProduct = {
    productId: string
    asin:      string
    title:     string
    category:  string
    consecutiveFails: number
  }

  const deadProducts: CheckedProduct[] = []

  await runBatched(products, 3, 800, async (product) => {
    const id   = product.id
    const asin = product.asin!

    const result = await checkAmazonLink(asin)

    const prev            = entries[id]
    const wasDeadBefore   = prev?.status === 'dead'
    const isDeadNow       = result.status === 'dead'
    const consecutiveFails = isDeadNow
      ? ((wasDeadBefore ? (prev.consecutiveFails ?? 0) : 0) + 1)
      : 0

    const entry: LinkHealthEntry = {
      productId:        id,
      asin,
      status:           result.status,
      httpStatus:       result.httpStatus,
      checkedAt:        new Date().toISOString(),
      consecutiveFails,
      failureReason:    result.failureReason,
      redirectTarget:   result.redirectTarget,
    }

    entries[id] = entry

    switch (result.status) {
      case 'alive':        countAlive++;        break
      case 'dead':         countDead++;         break
      case 'rate-limited': countRateLimited++;  break
      default:             countUnknown++;      break
    }

    if (isDeadNow && consecutiveFails >= 2) {
      deadProducts.push({
        productId:        id,
        asin,
        title:            product.title,
        category:         product.category,
        consecutiveFails,
      })
    }

    console.log(
      `[link-audit] ${asin} → ${result.status}` +
      (result.failureReason ? ` (${result.failureReason})` : '')
    )
  })

  // ── Persist results ───────────────────────────────────────────────────────
  const cache: LinkHealthCache = {
    generatedAt: new Date().toISOString(),
    entries,
  }

  if (!dryRun) {
    saveLinkHealthCache(cache)
  }

  // ── Auto-quarantine: products with ≥ 2 consecutive dead checks ────────────
  let autoQuarantined = 0

  if (!dryRun && deadProducts.length > 0) {
    const toQuarantine = deadProducts.filter(p => !isQuarantined(p.productId))

    if (toQuarantine.length > 0) {
      const result = bulkQuarantine(
        toQuarantine.map(p => ({
          productId:      p.productId,
          asin:           p.asin,
          title:          p.title,
          category:       p.category,
          reason:         `Enlace Amazon inaccesible — ${p.consecutiveFails} auditorías consecutivas fallidas`,
          quarantinedBy:  'audit' as const,
        }))
      )
      autoQuarantined = result.added
      if (autoQuarantined > 0) {
        console.warn(
          `[link-audit] Auto-quarantined ${autoQuarantined} product(s) with ≥2 consecutive dead links`
        )
      }
    }
  }

  return NextResponse.json({
    ok:             true,
    dryRun,
    checked:        products.length,
    alive:          countAlive,
    dead:           countDead,
    rateLimited:    countRateLimited,
    unknown:        countUnknown,
    autoQuarantined,
    offset,
    totalEligible:  eligible.length,
    durationMs:     Date.now() - startTime,
  })
}
