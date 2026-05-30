import { NextRequest, NextResponse } from 'next/server'
import { buildCatalogMetrics } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/catalog
 * Catalog-focused observability report — full product table with engagement data.
 *
 * Returns:
 *   meta          → generation timestamp, total products, total clicks, note on clickShare
 *   allProducts   → EVERY catalog product ranked by clicks desc (includes zero-click products)
 *   byCategory    → per-category aggregation: totalProducts, productsWithClicks, totalClicks, avg
 *   deadProducts  → products with zero clicks — candidates for catalog review
 *   insights      → summary counts + most/least active category + top performer title
 *
 * Use this endpoint to answer:
 *   - "Which products are dead weight?"
 *   - "Which categories are underperforming?"
 *   - "What is each product's share of total affiliate clicks?"
 *
 * Optional protection: set ANALYTICS_SECRET env var.
 * Request with: Authorization: Bearer <secret>
 */
export async function GET(req: NextRequest) {
  // Optional secret gate (same as /api/analytics)
  const secret = process.env.ANALYTICS_SECRET
  if (secret) {
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (token !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  const report = await buildCatalogMetrics()

  return NextResponse.json({ ok: true, ...report })
}
