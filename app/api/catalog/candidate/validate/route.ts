/**
 * POST /api/catalog/candidate/validate
 *
 * Validates a single ASIN against all 9 catalog-entry gates before it is
 * allowed into the GOODPRICE catalog. Call this before adding any new product.
 *
 * Authentication:
 *   - Requires Authorization: Bearer {CRON_SECRET} in production
 *   - Skips auth check in development (NODE_ENV=development)
 *
 * Request body:
 *   {
 *     "asin": "B09XYZ12345",
 *     "config": {                    // all optional
 *       "minPrice":   20,
 *       "maxPrice":   300,
 *       "minRating":  4.2,
 *       "minReviews": 500
 *     }
 *   }
 *
 * Response 200 — CandidateValidationResult:
 *   {
 *     "asin":            "B09XYZ12345",
 *     "finalAsin":       "B09XYZ12345",
 *     "http200":         true,
 *     "redirected":      false,
 *     "priceFound":      true,
 *     "price":           99.99,
 *     "imageFound":      true,
 *     "imageUrl":        "https://...",
 *     "availability":    "available",
 *     "rating":          4.7,
 *     "reviewCount":     12345,
 *     "shipsToColombia": true,
 *     "decision":        "APPROVED",
 *     "gates":           [...],
 *     "checkedAt":       "2026-06-14T...",
 *     "durationMs":      3200
 *   }
 *
 * Response 400: missing or invalid asin
 * Response 401: missing/wrong authorization
 * Response 500: unexpected failure
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateCandidate } from '@/lib/catalog/candidate/validator'
import type { CandidateValidationConfig } from '@/lib/catalog/candidate/types'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const ASIN_RE = /^[A-Z0-9]{10}$/

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────────────────────────

  const cronSecret = process.env.CRON_SECRET
  const isDev      = process.env.NODE_ENV === 'development'

  if (!isDev && cronSecret) {
    const auth  = req.headers.get('authorization') ?? ''
    const token = auth.replace('Bearer ', '')
    if (token !== cronSecret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────

  let asin: string
  const config: CandidateValidationConfig = {}

  try {
    const body = await req.json().catch(() => ({}))

    if (typeof body.asin !== 'string' || !ASIN_RE.test(body.asin.toUpperCase())) {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid asin. Must be a 10-character alphanumeric string.' },
        { status: 400 },
      )
    }

    asin = body.asin.toUpperCase()

    if (body.config && typeof body.config === 'object') {
      const c = body.config as Record<string, unknown>
      if (typeof c.minPrice   === 'number') config.minPrice   = c.minPrice
      if (typeof c.maxPrice   === 'number') config.maxPrice   = c.maxPrice
      if (typeof c.minRating  === 'number') config.minRating  = c.minRating
      if (typeof c.minReviews === 'number') config.minReviews = c.minReviews
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  // ── Validate ──────────────────────────────────────────────────────────────

  try {
    const result = await validateCandidate(asin, config)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
