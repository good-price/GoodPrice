/**
 * POST /api/pricing/bulk
 *
 * Returns current Amazon pricing data for a list of productIds.
 * Used by WatchlistGrid to hydrate price cards after mount.
 *
 * Body:   { productIds: string[] }
 * Returns: { ok: true, offers: Record<string, WatchlistOfferData> }
 *
 * Silently omits products with no offer data — client degrades gracefully.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPricingStore } from '@/lib/pricing/store'
import { detectTrend, isNearAllTimeLow } from '@/lib/pricing/utils/trends'
import { getCachedRate } from '@/lib/currency'
import type { WatchlistOfferData } from '@/lib/watchlist/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PRODUCTS = 50

export async function POST(req: NextRequest) {
  let body: { productIds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { productIds } = body
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'productIds must be a non-empty array' }, { status: 400 })
  }

  // Sanitize and limit
  const ids: string[] = productIds
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, MAX_PRODUCTS)

  const store = getPricingStore()
  const offers: Record<string, WatchlistOfferData> = {}
  const rate = getCachedRate()

  await Promise.allSettled(
    ids.map(async (productId) => {
      try {
        // Best available Amazon offer for this product
        const productOffers = await store.getOffers(productId)
        const amazonOffer = productOffers
          .filter(
            o =>
              o.retailerId === 'amazon' &&
              o.availability !== 'out_of_stock' &&
              o.availability !== 'discontinued',
          )
          .sort((a, b) => a.priceUSD - b.priceUSD)[0]

        if (!amazonOffer) return

        // Aggregated price history for trend + ATL detection
        const history = await store.getPriceHistory(productId, 90)

        const trend = history.length >= 7
          ? detectTrend(history.slice(-30))
          : undefined

        const allTimeLow = history.length >= 3
          ? Math.min(...history.map(p => p.lowestPriceUSD))
          : null

        const nearATL = allTimeLow !== null
          ? isNearAllTimeLow(amazonOffer.priceUSD, allTimeLow)
          : false

        // Position label: how current price compares to recent average
        let positionLabel: string | undefined
        if (history.length >= 7) {
          const recent = history.slice(-30)
          const avg = recent.reduce((s, p) => s + p.averagePriceUSD, 0) / recent.length
          if (avg > 0) {
            const pct = ((avg - amazonOffer.priceUSD) / avg) * 100
            if (pct >= 10) positionLabel = `${Math.round(pct)}% bajo promedio`
            else if (pct <= -10) positionLabel = `${Math.round(-pct)}% sobre promedio`
          }
        }

        // COP conversion via TRM rate (updated daily by /api/currency/update cron)
        const priceCOP = Math.round(amazonOffer.priceUSD * rate)

        offers[productId] = {
          priceUSD:      amazonOffer.priceUSD,
          priceCOP,
          availability:  amazonOffer.availability,
          lastCheckedAt: amazonOffer.lastCheckedAt,
          trend,
          positionLabel,
          isNearATL:     nearATL,
        }
      } catch {
        // Silently skip — client degrades gracefully
      }
    }),
  )

  return NextResponse.json({ ok: true, offers })
}
