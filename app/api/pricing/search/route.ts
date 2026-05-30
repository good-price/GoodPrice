/**
 * POST /api/pricing/search
 *
 * Search MercadoLibre for a catalog product and return match candidates.
 * Used to manually find and confirm the best ML listing for a product.
 *
 * Request body:
 *   {
 *     "productId": "elec-001",          // required: GOODPRICE catalog ID
 *     "query": "custom search query",   // optional: override default search query
 *     "limit": 10,                      // optional: max results (1–20, default 10)
 *     "expectedUSD": 189.99             // optional: override catalog Amazon price
 *   }
 *
 * Response 200:
 *   {
 *     "ok": true,
 *     "productId": "elec-001",
 *     "query": "...",
 *     "copPerUSD": 4150,
 *     "totalResults": 25,
 *     "candidates": [
 *       {
 *         "score": 72,
 *         "isConfident": true,
 *         "item": { ... MLSearchItem },
 *         "breakdown": { titleScore, priceScore, listingScore, availabilityScore }
 *       }
 *     ]
 *   }
 *
 * Response 400: missing productId
 * Response 404: product mapping not found
 */

import { NextRequest, NextResponse } from 'next/server'
import { searchProducts, getCOPtoUSDRate } from '@/lib/pricing/ml/client'
import { rankMLResults, filterActiveResults } from '@/lib/pricing/ml/search'
import { getPricingStore } from '@/lib/pricing/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Catalog Amazon prices as fallback reference
const CATALOG_PRICES_USD: Record<string, number> = {
  'elec-001': 189.99, 'elec-002': 149.99, 'elec-003': 139.99,
  'elec-004':  25.99, 'elec-005':  59.99,
  'game-001':  59.99, 'game-002':  49.99, 'game-003':  39.99,
  'game-004':  79.99, 'game-005': 199.99,
  'ofic-001':  99.99, 'ofic-002':  27.99, 'ofic-003':  23.99,
  'coci-001':  59.99, 'coci-002':  29.99, 'coci-003':  44.99,
  'dep-001':  349.99, 'dep-002':   10.99, 'dep-003':   19.99,
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { productId, query: customQuery, limit = 10, expectedUSD: customExpected } =
    body as Record<string, unknown>

  if (!productId || typeof productId !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'productId is required (string)' },
      { status: 400 },
    )
  }

  // Load mapping to get the default search query
  const store   = getPricingStore()
  const mapping = await store.getMapping(productId)

  if (!mapping) {
    return NextResponse.json(
      { ok: false, error: `No mapping found for productId "${productId}"` },
      { status: 404 },
    )
  }

  const query = (typeof customQuery === 'string' && customQuery.trim())
    ? customQuery.trim()
    : mapping.searchQuery

  const expectedUSD = typeof customExpected === 'number'
    ? customExpected
    : (CATALOG_PRICES_USD[productId] ?? 100)

  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 20)

  try {
    const [searchResponse, copPerUSD] = await Promise.all([
      searchProducts(query, safeLimit, 'new'),
      getCOPtoUSDRate(),
    ])

    const active     = filterActiveResults(searchResponse.results)
    const candidates = rankMLResults(active, query, expectedUSD, copPerUSD)

    return NextResponse.json({
      ok:           true,
      productId,
      query,
      copPerUSD,
      totalResults: searchResponse.paging.total,
      candidates:   candidates.slice(0, safeLimit).map(c => ({
        score:       c.score,
        isConfident: c.score >= 45,
        verdict:     c.verdict,
        breakdown:   c.breakdown,
        item: {
          id:                 c.item.id,
          title:              c.item.title,
          price:              c.item.price,
          priceFormatted:     `$ ${Math.round(c.item.price).toLocaleString('es-CO')}`,
          priceUSD:           Math.round((c.item.price / copPerUSD) * 100) / 100,
          condition:          c.item.condition,
          available_quantity: c.item.available_quantity,
          sold_quantity:      c.item.sold_quantity,
          listing_type_id:    c.item.listing_type_id,
          free_shipping:      c.item.shipping.free_shipping,
          permalink:          c.item.permalink,
          thumbnail:          c.item.thumbnail,
        },
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
