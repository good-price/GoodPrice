/**
 * POST /api/pricing/bulk
 *
 * Returns current ML pricing data for a list of productIds.
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
import type { WatchlistOfferData } from '@/lib/watchlist/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PRODUCTS = 50
const FALLBACK_COP_PER_USD = 4150

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

  await Promise.allSettled(
    ids.map(async (productId) => {
      try {
        // Get the best ML offer for this product
        const productOffers = await store.getOffers(productId)
        const mlOffer = productOffers
          .filter(
            o =>
              o.retailerId === 'mercadolibre' &&
              o.availability !== 'out_of_stock' &&
              o.availability !== 'discontinued',
          )
          .sort((a, b) => a.priceUSD - b.priceUSD)[0]

        if (!mlOffer) return

        // Get aggregated price history for trend + ATL detection
        // getPriceHistory returns PriceHistoryPoint[] — compatible with detectTrend
        const history = await store.getPriceHistory(productId, 90)

        const trend = history.length >= 7
          ? detectTrend(history.slice(-30))
          : undefined

        const allTimeLow = history.length >= 3
          ? Math.min(...history.map(p => p.lowestPriceUSD))
          : null

        const nearATL = allTimeLow !== null
          ? isNearAllTimeLow(mlOffer.priceUSD, allTimeLow)
          : false

        // Position label: how current price compares to recent average
        let positionLabel: string | undefined
        if (history.length >= 7) {
          const recent = history.slice(-30)
          const avg = recent.reduce((s, p) => s + p.averagePriceUSD, 0) / recent.length
          if (avg > 0) {
            const pct = ((avg - mlOffer.priceUSD) / avg) * 100
            if (pct >= 10) positionLabel = `${Math.round(pct)}% bajo promedio`
            else if (pct <= -10) positionLabel = `${Math.round(-pct)}% sobre promedio`
          }
        }

        // `mlOffer.price` is in native currency (COP for ML Colombia)
        const priceCOP = mlOffer.currency === 'COP'
          ? Math.round(mlOffer.price)
          : Math.round(mlOffer.priceUSD * FALLBACK_COP_PER_USD)

        offers[productId] = {
          priceUSD:      mlOffer.priceUSD,
          priceCOP,
          availability:  mlOffer.availability,
          lastCheckedAt: mlOffer.lastCheckedAt,
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
