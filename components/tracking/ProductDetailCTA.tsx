'use client'

/**
 * components/tracking/ProductDetailCTA.tsx
 *
 * CTA button for the product detail page (/productos/[asin]).
 * Renders the "Ver en Amazon" link and fires two tracking events on click:
 *
 *   1. trackProductClick()   → POST /api/track { event: 'product_click' }
 *                              Server-side analytics (monetization tracking)
 *
 *   2. trackSessionEvent()   → localStorage SessionProfile update
 *                              Client-side personalization signal
 *
 * Must be a Client Component because it requires onClick (event handlers
 * are not supported in Server Components).
 *
 * All other product detail content remains in the Server Component page.
 */

import { useCallback } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button }            from '@/components/ui/button'
import { useProductTrack }   from '@/hooks/useTrack'
import { trackSessionEvent } from '@/lib/session'
import { ga4Event }          from '@/lib/analytics/ga4'

interface Props {
  affiliateUrl: string
  productId:   string
  asin:        string
  category:    string
  isOffer:     boolean
  title:       string
}

export function ProductDetailCTA({
  affiliateUrl,
  productId,
  asin,
  category,
  isOffer,
  title,
}: Props) {
  const trackProductClick = useProductTrack()

  // Mirrors the same dual-tracking pattern used in ProductCard:
  //   - server-side analytics (persistent, monetization)
  //   - client-side session (localStorage, personalization)
  const handleClick = useCallback(() => {
    trackProductClick(productId, asin, category)
    trackSessionEvent({ type: 'product_click', productId, category, ts: Date.now() })
    ga4Event('affiliate_click', {
      product_id: productId,
      asin,
      category,
      is_offer:   isOffer,
      source:     'product_detail',
    })
  }, [productId, asin, category, isOffer, trackProductClick])

  return (
    <Button
      size="lg"
      className="bg-[#F7A823] hover:bg-[#e8961a] text-black font-bold gap-2 w-full md:w-auto"
      asChild
    >
      <a
        href={affiliateUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        aria-label={`Comprar ${title} en Amazon`}
        onClick={handleClick}
      >
        <ExternalLink className="h-4 w-4" />
        {isOffer ? 'Ver oferta en Amazon' : 'Ver en Amazon'}
      </a>
    </Button>
  )
}
