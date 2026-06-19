/**
 * GET /api/pricing/offers/[productId]
 *
 * Returns all current retailer offers for a catalog product.
 * Used internally and as the data source for future price comparison UI.
 *
 * Response 200:
 *   {
 *     "ok": true,
 *     "productId": "elec-001",
 *     "offers": [
 *       {
 *         "retailerId": "amazon",
 *         "priceUSD": 312.65,
 *         "availability": "in_stock",
 *         "url": "https://www.amazon.com/dp/B0CHWRXH8B",
 *         "lastCheckedAt": "2025-05-26T14:30:00Z"
 *       }
 *     ]
 *   }
 *
 * Response 404: no offers found for this product
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPricingStore } from '@/lib/pricing/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { productId: string }
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { productId } = params

  if (!productId) {
    return NextResponse.json({ ok: false, error: 'productId is required' }, { status: 400 })
  }

  try {
    const store  = getPricingStore()
    const offers = await store.getOffers(productId)

    if (offers.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No offers found for "${productId}"` },
        { status: 404 },
      )
    }

    // Sort by priceUSD ascending (cheapest first)
    const sorted = [...offers].sort((a, b) => a.priceUSD - b.priceUSD)

    return NextResponse.json({
      ok: true,
      productId,
      count: sorted.length,
      offers: sorted.map(o => ({
        retailerId:               o.retailerId,
        externalId:               o.externalId,
        priceUSD:                 o.priceUSD,
        priceCOP:                 o.price,
        oldPrice:                 o.oldPrice,
        discountPercent:          o.discountPercent,
        availability:             o.availability,
        shippingCostEstimateUSD:  o.shippingCostEstimateUSD,
        totalLandedCostUSD:       o.totalLandedCostUSD,
        url:                      o.url,
        affiliateUrl:             o.affiliateUrl,
        lastCheckedAt:            o.lastCheckedAt,
        validUntil:               o.validUntil,
        source:                   o.source,
        isVerified:               o.isVerified,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
