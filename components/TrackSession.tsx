'use client'

/**
 * TrackSession — invisible client component that fires session events on mount.
 *
 * Companion to TrackPageView: while TrackPageView sends events to the server
 * analytics endpoint (/api/track), TrackSession updates the localStorage
 * session profile for client-side personalisation — no server call needed.
 *
 * Renders nothing — zero visual impact.
 *
 * Usage in server component pages:
 *   <TrackSession category="gaming" />           // category browse
 *   <TrackSession productId="abc123" />          // product view
 *   <TrackSession searchQuery="teclado" />       // search
 *
 * Multiple props may be passed together:
 *   <TrackSession category="gaming" productId="abc123" />
 */

import { useEffect } from 'react'
import { trackSessionEvent } from '@/lib/session'

interface TrackSessionProps {
  /** Category slug — fires a category_view event */
  category?:    string
  /** Product ID — fires a product_view event */
  productId?:   string
  /** Search query — fires a search event */
  searchQuery?: string
}

export function TrackSession({ category, productId, searchQuery }: TrackSessionProps) {
  useEffect(() => {
    const ts = Date.now()
    if (category)    trackSessionEvent({ type: 'category_view', category,              ts })
    if (productId)   trackSessionEvent({ type: 'product_view',  productId,             ts })
    if (searchQuery) trackSessionEvent({ type: 'search',        query: searchQuery,    ts })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally fires once on mount — deps omitted

  return null
}
