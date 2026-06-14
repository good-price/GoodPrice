/**
 * POST /api/catalog/candidate/admit
 *
 * Validates an ASIN and, if APPROVED, creates a ProductDraft ready for
 * catalog promotion. This is the ONLY legitimate way to add a product to
 * GOODPRICE — direct edits to data/catalog/*.ts files without prior
 * validation via this endpoint are prohibited.
 *
 * Authentication: Bearer {CRON_SECRET} in production; open in development.
 *
 * Request body:
 *   {
 *     "asin":     "B09XYZ12345",      // required
 *     "category": "electronica",      // required — one of the catalog categories
 *     "config": {                     // optional — override validation thresholds
 *       "minPrice":   20,
 *       "maxPrice":   300,
 *       "minRating":  4.2,
 *       "minReviews": 500
 *     }
 *   }
 *
 * Response 200 (APPROVED):
 *   {
 *     "ok": true,
 *     "decision": "APPROVED",
 *     "draft": { ProductDraft },
 *     "validation": { CandidateValidationResult }
 *   }
 *
 * Response 200 (REJECTED):
 *   {
 *     "ok": false,
 *     "decision": "REJECTED",
 *     "reason": "unavailable: out_of_stock",
 *     "validation": { CandidateValidationResult }
 *   }
 *
 * Response 400: missing/invalid asin or category
 * Response 401: unauthorized
 * Response 500: unexpected failure
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateCandidate } from '@/lib/catalog/candidate/validator'
import { saveDraft } from '@/lib/catalog/drafts'
import { appendAdmissionLog } from '@/lib/catalog/admission-log'
import { getRawProducts } from '@/data/catalog'
import type { CandidateValidationConfig, ProductDraft } from '@/lib/catalog/candidate/types'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const ASIN_RE = /^[A-Z0-9]{10}$/

const VALID_CATEGORIES = new Set([
  'electronica', 'gaming', 'hogar', 'cocina', 'deporte',
  'oficina', 'belleza', 'mascotas', 'bebes', 'herramientas',
])

const CATEGORY_PREFIX: Record<string, string> = {
  electronica:  'elec',
  gaming:       'game',
  hogar:        'hogar',
  cocina:       'coci',
  deporte:      'dep',
  oficina:      'ofic',
  belleza:      'bell',
  mascotas:     'masc',
  bebes:        'beb',
  herramientas: 'herr',
}

function suggestProductId(category: string): string {
  const prefix = CATEGORY_PREFIX[category] ?? category.slice(0, 4)
  const all    = getRawProducts()
  const nums   = all
    .filter(p => p.id?.startsWith(prefix + '-'))
    .map(p => parseInt(p.id?.split('-')[1] ?? '0', 10))
    .filter(n => !isNaN(n))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

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
  let category: string
  const config: CandidateValidationConfig = {}

  try {
    const body = await req.json().catch(() => ({}))

    if (typeof body.asin !== 'string' || !ASIN_RE.test(body.asin.toUpperCase())) {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid asin. Must be a 10-character alphanumeric string.' },
        { status: 400 },
      )
    }
    if (typeof body.category !== 'string' || !VALID_CATEGORIES.has(body.category)) {
      return NextResponse.json(
        { ok: false, error: `Missing or invalid category. Valid values: ${Array.from(VALID_CATEGORIES).join(', ')}` },
        { status: 400 },
      )
    }

    asin     = body.asin.toUpperCase()
    category = body.category

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
    const validation = await validateCandidate(asin, config)
    const gatesFailed = validation.gates.filter(g => !g.passed).map(g => `G${g.gate}`)

    // Always log to admission history
    await appendAdmissionLog({
      asin:        validation.asin,
      finalAsin:   validation.finalAsin,
      category,
      decision:    validation.decision,
      reason:      validation.reason,
      gatesFailed,
      checkedAt:   validation.checkedAt,
    })

    if (validation.decision === 'REJECTED') {
      return NextResponse.json({
        ok:         false,
        decision:   'REJECTED',
        reason:     validation.reason,
        validation,
      })
    }

    // ── APPROVED — create ProductDraft ──────────────────────────────────────

    const draftId = `draft_${validation.finalAsin}_${Date.now()}`

    const draft: ProductDraft = {
      draftId,
      asin:         validation.asin,
      finalAsin:    validation.finalAsin,
      status:       'pending',
      title:        validation.title,
      brand:        validation.brand,
      price:        validation.price!,
      imageUrl:     validation.imageUrl!,
      rating:       validation.rating!,
      reviewCount:  validation.reviewCount!,
      suggestedId:  suggestProductId(category),
      category,
      submittedAt:  validation.checkedAt,
      validationReport: validation,
    }

    saveDraft(draft)

    // Update log with draftId
    await appendAdmissionLog({
      asin:        validation.asin,
      finalAsin:   validation.finalAsin,
      category,
      decision:    'APPROVED',
      gatesFailed: [],
      checkedAt:   validation.checkedAt,
      draftId,
    })

    return NextResponse.json({
      ok:       true,
      decision: 'APPROVED',
      draft,
      validation,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
