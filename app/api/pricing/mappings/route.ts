/**
 * GET  /api/pricing/mappings         — List all product→ML mappings
 * POST /api/pricing/mappings         — Update a mapping (confirm mlItemId)
 *
 * GET response:
 *   {
 *     "ok": true,
 *     "count": 19,
 *     "mapped": 7,       // products with an mlItemId set
 *     "verified": 2,     // manually confirmed mappings
 *     "mappings": { ... MappingsStore }
 *   }
 *
 * POST body:
 *   {
 *     "productId": "elec-001",        // required
 *     "mlItemId": "MCO1234567890",    // required: ML item ID to assign
 *     "verified": true                // optional: mark as manually confirmed
 *   }
 *
 * POST response 200:
 *   { "ok": true, "mapping": { ... ProductMapping } }
 *
 * POST response 400: missing required fields
 * POST response 404: productId not in mappings store
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPricingStore } from '@/lib/pricing/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── GET: list all mappings ────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const store    = getPricingStore()
    const mappings = await store.getMappings()

    const values  = Object.values(mappings)
    const mapped   = values.filter(m => m.mlItemId !== null).length
    const verified = values.filter(m => m.verified).length

    return NextResponse.json({
      ok:       true,
      count:    values.length,
      mapped,
      verified,
      mappings,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

// ── POST: update a mapping ────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { productId, mlItemId, verified } = body as Record<string, unknown>

  if (!productId || typeof productId !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'productId is required (string)' },
      { status: 400 },
    )
  }

  if (!mlItemId || typeof mlItemId !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'mlItemId is required (string)' },
      { status: 400 },
    )
  }

  // Validate ML item ID format
  if (!/^MCO-?\d{7,12}$/i.test(mlItemId)) {
    return NextResponse.json(
      { ok: false, error: `Invalid ML item ID format: "${mlItemId}" (expected MCO[7-12 digits])` },
      { status: 400 },
    )
  }

  const store   = getPricingStore()
  const mapping = await store.getMapping(productId)

  if (!mapping) {
    return NextResponse.json(
      { ok: false, error: `Product "${productId}" not found in mappings store` },
      { status: 404 },
    )
  }

  const updated = {
    ...mapping,
    mlItemId:  mlItemId.toUpperCase(),
    verified:  verified === true,
    lastCheckedAt: null, // reset so next check fetches fresh data
  }

  await store.saveMapping(updated)

  return NextResponse.json({ ok: true, mapping: updated })
}
