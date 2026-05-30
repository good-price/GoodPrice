import { NextRequest, NextResponse } from 'next/server'
import { getRawProducts } from '@/data/catalog'
import { validateBatch, isStale } from '@/lib/catalog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // seconds (Vercel hobby: 60s limit)

/**
 * POST /api/catalog/validate
 * Triggers ASIN validation for the entire catalog (or a subset).
 *
 * Body (optional JSON):
 *   { asins?: string[], staleOnly?: boolean, secret?: string }
 *
 * Secret gate: set CATALOG_VALIDATE_SECRET env var to protect this endpoint.
 */
export async function POST(req: NextRequest) {
  // Optional secret gate
  const secret = process.env.CATALOG_VALIDATE_SECRET
  if (secret) {
    const body = await req.json().catch(() => ({}))
    if (body.secret !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = secret
    ? await req.json().catch(() => ({}))
    : await req.json().catch(() => ({}))

  const rawProducts = getRawProducts()

  // Determine which ASINs to validate
  let asinsToCheck: string[]
  if (body.asins && Array.isArray(body.asins)) {
    asinsToCheck = body.asins
  } else if (body.staleOnly) {
    asinsToCheck = rawProducts
      .filter(p => isStale(p.lastValidated))
      .map(p => p.asin)
  } else {
    asinsToCheck = rawProducts.map(p => p.asin)
  }

  if (asinsToCheck.length === 0) {
    return NextResponse.json({ ok: true, message: 'No ASINs to validate', results: {} })
  }

  // Run validation with conservative concurrency to avoid Amazon rate limits
  const results = await validateBatch(asinsToCheck, {
    concurrency: 2,
    delayMs: 800,
  })

  const summary = {
    checked: results.size,
    active: 0,
    inactive: 0,
    unverified: 0,
    stale: 0,
  }

  const output: Record<string, object> = {}
  results.forEach((result, asin) => {
    output[asin] = result
    summary[result.status] = (summary[result.status] ?? 0) + 1
  })

  return NextResponse.json({ ok: true, summary, results: output })
}
