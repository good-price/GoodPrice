/**
 * GET /api/pricing/history/[productId]?days=90&retailer=amazon
 *
 * Returns aggregated daily price history for a catalog product.
 * History is derived from accumulated price snapshots.
 *
 * Query params:
 *   days      - How many days of history to return (1–365, default 90)
 *   retailer  - Filter to a single retailer (optional)
 *
 * Response 200:
 *   {
 *     "ok": true,
 *     "productId": "elec-001",
 *     "days": 90,
 *     "points": [
 *       {
 *         "date": "2025-05-20",
 *         "lowestPriceUSD": 298.12,
 *         "highestPriceUSD": 312.65,
 *         "averagePriceUSD": 305.38,
 *         "bestRetailerId": "amazon",
 *         "endOfDayAvailability": "in_stock",
 *         "snapshotCount": 3
 *       }
 *     ],
 *     "allTimeLow": 298.12,
 *     "allTimeHigh": 342.00
 *   }
 *
 * Response 404: no history found
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPricingStore } from '@/lib/pricing/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { productId: string }
}

export async function GET(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { productId } = params
  const searchParams  = req.nextUrl.searchParams

  if (!productId) {
    return NextResponse.json({ ok: false, error: 'productId is required' }, { status: 400 })
  }

  const days     = Math.min(365, Math.max(1, parseInt(searchParams.get('days') ?? '90', 10)))
  const retailer = searchParams.get('retailer') ?? undefined

  try {
    const store = getPricingStore()

    const [history, snapshots] = await Promise.all([
      store.getPriceHistory(productId, days),
      store.getSnapshots(productId, retailer),
    ])

    if (history.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No price history found for "${productId}"` },
        { status: 404 },
      )
    }

    // Compute all-time stats from raw snapshots (not limited to `days`)
    const allPrices   = snapshots.map(s => s.priceUSD)
    const allTimeLow  = allPrices.length > 0 ? Math.min(...allPrices) : null
    const allTimeHigh = allPrices.length > 0 ? Math.max(...allPrices) : null

    return NextResponse.json({
      ok: true,
      productId,
      days,
      retailer:      retailer ?? null,
      snapshotCount: snapshots.length,
      allTimeLow,
      allTimeHigh,
      points:        history,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
