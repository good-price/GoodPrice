'use client'

/**
 * ProductCard — grid card for product lists.
 *
 * Navigation strategy (SEO + UX):
 *   Image + title  → /productos/{asin}  (internal — builds PageRank for product pages)
 *   CTA button     → Amazon affiliate   (external — conversion click)
 *
 * Image reliability:
 *   1. getProductImageSrc() pre-emptively substitutes the category placeholder
 *      for any URL that is structurally invalid OR matches the known-broken CDN pattern
 *      (images-na.ssl-images-amazon.com/images/I/). This runs server-side so the
 *      placeholder is in the initial HTML — no flash of broken image.
 *   2. onError handler catches unexpected runtime failures (CDN hiccup, new 404s
 *      not yet detected by audit). Sets the placeholder immediately.
 *   3. Container is a fixed aspect-square — no layout shift in either path.
 *
 * Affiliate compliance:
 *   Amazon CTA uses rel="noopener noreferrer sponsored" per Google's guidelines.
 */

import { useCallback, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Star, ExternalLink } from 'lucide-react'
import { Product } from '@/types'
import { buildAffiliateUrl } from '@/lib/affiliate'
import { useProductTrack } from '@/hooks/useTrack'
import { getProductImageSrc, getCategoryPlaceholder } from '@/lib/catalog/placeholders'
import { getBadgeStyle } from '@/lib/catalog/badges'
import { trackSessionEvent } from '@/lib/session'

interface ProductCardProps {
  product: Product
  /** Set true for above-the-fold cards to hint Next.js to preload the image (LCP). */
  priority?: boolean
  /**
   * Pre-formatted COP price string, computed server-side.
   * Example: "$ 1.029.000"
   * When provided, COP is displayed as the primary price and USD becomes a secondary reference.
   * When absent, falls back to USD-only display (graceful degradation — no snapshot yet).
   */
  copPrice?: string
  /**
   * Dynamic badge computed server-side by buildSmartBadge().
   * Takes priority over product.badge when present.
   * Uses semantic colour coding via getBadgeStyle() rather than the static gold.
   * Examples: "En tendencia", "Top Colombia", "Mejor valorado".
   */
  dynamicBadge?: string
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < Math.floor(rating)
              ? 'fill-[#F7A823] text-[#F7A823]'
              : i < rating
              ? 'fill-[#F7A823]/50 text-[#F7A823]/50'
              : 'fill-gray-200 text-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

function formatReviews(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}

function discountPercent(price: number, oldPrice: number): number {
  return Math.round(((oldPrice - price) / oldPrice) * 100)
}

export function ProductCard({ product, priority = false, copPrice, dynamicBadge }: ProductCardProps) {
  const affiliateUrl = buildAffiliateUrl(product.amazonUrl)
  const productUrl   = product.asin ? `/productos/${product.asin}` : null
  const discount     = product.oldPrice ? discountPercent(product.price, product.oldPrice) : null
  const trackProductClick = useProductTrack()

  // Pre-emptive: replace known-broken CDN URLs with category placeholder before first render.
  // This is computed once (no re-renders needed for the happy path).
  const initialSrc = getProductImageSrc(product.image, product.category)

  // Reactive fallback: if the image fails at runtime (unexpected 404, CDN hiccup),
  // swap to the category placeholder without any layout shift.
  const [imgSrc, setImgSrc] = useState(initialSrc)

  const handleImageError = useCallback(() => {
    setImgSrc(getCategoryPlaceholder(product.category))
  }, [product.category])

  // Fire-and-forget — tracks the Amazon outbound click (affiliate conversion intent)
  const handleAmazonClick = useCallback(() => {
    // Server-side analytics (existing system)
    trackProductClick(product.id, product.asin, product.category)
    // Client-side session profile (personalisation engine)
    trackSessionEvent({
      type:      'product_click',
      productId: product.id,
      category:  product.category,
      ts:        Date.now(),
    })
  }, [product.id, product.asin, product.category, trackProductClick])

  // ── Badge overlays ───────────────────────────────────────────────────────────
  // dynamicBadge (server-computed) takes priority over the static product.badge.
  // getBadgeStyle() returns semantic Tailwind classes per badge type — dynamic
  // badges use distinct colours; static badges fall back to brand gold.
  const activeBadge = dynamicBadge ?? product.badge
  const imageBadges = (
    <>
      {activeBadge && (
        <span
          className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${getBadgeStyle(activeBadge)}`}
        >
          {activeBadge}
        </span>
      )}
      {discount && (
        <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          -{discount}%
        </span>
      )}
    </>
  )

  // ── Image element (shared between both wrappers) ──────────────────────────────
  const imageEl = (
    <Image
      src={imgSrc}
      alt={product.title}
      fill
      className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
      priority={priority}
      unoptimized
      onError={handleImageError}
    />
  )

  return (
    <article className="group flex flex-col bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">

      {/* ── Image — links to product detail page ─────────────────────────────── */}
      {productUrl ? (
        <Link
          href={productUrl}
          className="relative bg-gray-50 flex items-center justify-center aspect-square overflow-hidden"
          tabIndex={-1}    // title link below is the primary keyboard target
          aria-hidden="true"
        >
          {imageEl}
          {imageBadges}
        </Link>
      ) : (
        <div className="relative bg-gray-50 flex items-center justify-center aspect-square overflow-hidden">
          {imageEl}
          {imageBadges}
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-3 flex-1">

        {/* Brand */}
        {product.brand && (
          <span className="text-[11px] font-medium text-blue-600 uppercase tracking-wide">
            {product.brand}
          </span>
        )}

        {/* Title — internal link (primary keyboard target) */}
        {productUrl ? (
          <Link
            href={productUrl}
            className="text-sm font-medium text-gray-800 leading-snug line-clamp-2 hover:text-[#e8961a] transition-colors"
          >
            {product.title}
          </Link>
        ) : (
          <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">
            {product.title}
          </p>
        )}

        {/* Rating */}
        <div className="flex items-center gap-1.5">
          <StarRating rating={product.rating} />
          <span className="text-xs text-gray-500">({formatReviews(product.reviews)})</span>
        </div>

        {/* Price — COP primary (when available) or USD fallback */}
        <div className="flex flex-col gap-0.5 mt-auto">
          {copPrice ? (
            <>
              <span className="text-base font-bold text-gray-900">{copPrice}</span>
              <span className="text-[11px] text-gray-400">
                ≈ USD ${product.price.toFixed(2)}
                {product.oldPrice && (
                  <span className="line-through ml-1">${product.oldPrice.toFixed(2)}</span>
                )}
              </span>
            </>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-gray-900">${product.price.toFixed(2)}</span>
              {product.oldPrice && (
                <span className="text-xs text-gray-400 line-through">${product.oldPrice.toFixed(2)}</span>
              )}
            </div>
          )}
        </div>

        {/* CTA — Amazon affiliate link */}
        <a
          href={affiliateUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={handleAmazonClick}
          className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-[#F7A823] hover:bg-[#e8961a] text-black font-semibold text-xs py-1.5 px-3 transition-colors"
          aria-label={`Ver ${product.title} en Amazon`}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          {product.isOffer ? 'Ver oferta' : 'Ver en Amazon'}
        </a>

      </div>
    </article>
  )
}
