import { NextRequest, NextResponse } from 'next/server'
import { recordProductClick, recordCategoryView } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

/**
 * POST /api/track
 * Receives a single TrackEvent from the client and stores it in the analytics store.
 *
 * This endpoint is internal — called only by useTrack() hook in the browser.
 * It returns immediately (fire-and-forget from the client's perspective).
 *
 * Supported events (see TrackEventType in types/index.ts):
 *   product_click — user clicked Amazon affiliate CTA (stored as click)
 *   category_view — user loaded a category page (stored as category view)
 *   product_view  — user loaded a product detail page (stored as product view)
 *
 * Body: TrackEvent (see types/index.ts)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event, productId, asin, category } = body

    if (!event) {
      return NextResponse.json({ ok: false, error: 'Missing event type' }, { status: 400 })
    }

    switch (event) {
      case 'product_click':
        if (productId) {
          await recordProductClick(String(productId), String(asin ?? ''))
        }
        break

      case 'category_view':
        if (category) {
          await recordCategoryView(String(category))
        }
        break

      case 'product_view':
        // Product page view — recorded as a product engagement signal.
        // Uses the same click counter so that views surface products in analytics.
        // This intentionally shares the click counter for MVP; separate view
        // counters can be added to the adapter when dedicated dashboards are built.
        if (productId) {
          await recordProductClick(String(productId), String(asin ?? ''))
        }
        break

      default:
        // Unknown event type — ignore silently to stay forward-compatible
        break
    }

    return NextResponse.json({ ok: true })
  } catch {
    // Never let a tracking failure surface an error to the client
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 })
  }
}
