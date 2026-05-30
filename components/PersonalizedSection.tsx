'use client'

/**
 * PersonalizedSection — adaptive "Basado en tus intereses" product section.
 *
 * Appears on the homepage only when the user has meaningful session data.
 * Invisible on first visit (no signal) — appears subtly on return visits.
 *
 * Architecture (ISR-safe):
 *   1. Server renders page via ISR (no blocking, full performance)
 *   2. Component mounts client-side — reads localStorage session profile
 *   3. If topCategories.length > 0 → fetches /api/session/profile?cats=...
 *   4. Renders product grid with personalised content
 *   5. Marks returned products as seen (recommendation memory)
 *
 * Privacy:
 *   - Only category slugs sent to server (no session ID, no PII)
 *   - seen/viewed/clicked products sent only as `exclude` IDs (opaque strings)
 *   - No external services involved
 *
 * Graceful degradation:
 *   - Returns null when: no session data, no categories, fetch fails
 *   - Never blocks the rest of the page or affects LCP
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Sparkles, ExternalLink } from 'lucide-react'
import type { Product } from '@/types'
import {
  loadProfile,
  getTopCategories,
  addToSeen,
  saveProfile,
  trackSessionEvent,
} from '@/lib/session'
import { buildAffiliateUrl } from '@/lib/affiliate'

// ── Mini product card (lightweight — no heavy imports for a client bundle) ────

function MiniCard({ product, onAmazonClick }: {
  product:       Product
  onAmazonClick: (productId: string) => void
}) {
  const affiliateUrl = buildAffiliateUrl(product.amazonUrl)
  const productUrl   = product.asin ? `/productos/${product.asin}` : null

  return (
    <article className="flex flex-col bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden group">
      {/* Image */}
      <div className="relative bg-gray-50 flex items-center justify-center aspect-square overflow-hidden">
        {productUrl ? (
          <Link href={productUrl} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
            <Image
              src={product.image}
              alt={product.title}
              fill
              className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
              unoptimized
            />
          </Link>
        ) : (
          <Image
            src={product.image}
            alt={product.title}
            fill
            className="object-contain p-3"
            sizes="25vw"
            unoptimized
          />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1.5 p-3 flex-1">
        {product.brand && (
          <span className="text-[10px] font-medium text-blue-600 uppercase tracking-wide">
            {product.brand}
          </span>
        )}
        {productUrl ? (
          <Link
            href={productUrl}
            className="text-xs font-medium text-gray-800 leading-snug line-clamp-2 hover:text-[#e8961a] transition-colors"
          >
            {product.title}
          </Link>
        ) : (
          <p className="text-xs font-medium text-gray-800 leading-snug line-clamp-2">
            {product.title}
          </p>
        )}
        <div className="flex items-baseline gap-1.5 mt-auto">
          <span className="text-sm font-bold text-gray-900">${product.price.toFixed(2)}</span>
          {product.oldPrice && (
            <span className="text-[10px] text-gray-400 line-through">${product.oldPrice.toFixed(2)}</span>
          )}
        </div>
        <a
          href={affiliateUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => onAmazonClick(product.id)}
          className="mt-1 w-full inline-flex items-center justify-center gap-1 rounded-md bg-[#F7A823] hover:bg-[#e8961a] text-black font-semibold text-[11px] py-1.5 px-2 transition-colors"
          aria-label={`Ver ${product.title} en Amazon`}
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          Ver en Amazon
        </a>
      </div>
    </article>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PersonalizedSection() {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [label,    setLabel]    = useState<string>('')

  useEffect(() => {
    let cancelled = false

    async function fetchPersonalized() {
      // Read profile from localStorage — null on first visit
      const profile = loadProfile()
      if (!profile) return

      const topCats = getTopCategories(profile, 3)
      if (topCats.length === 0) return

      // Build excluded IDs: clicked + viewed + already-recommended (deduplicated)
      const excludeSet = new Set([
        ...profile.clickedProducts,
        ...profile.viewedProducts,
        ...profile.seenRecommendations,
      ])
      const excludeParam = Array.from(excludeSet).slice(0, 60).join(',')

      try {
        const params = new URLSearchParams({
          cats:    topCats.join(','),
          limit:   '6',
          ...(excludeParam ? { exclude: excludeParam } : {}),
        })
        const res = await fetch(`/api/session/profile?${params}`, {
          cache: 'no-store',
        })
        if (!res.ok || cancelled) return

        const data: { products: Product[] } = await res.json()
        if (cancelled || data.products.length === 0) return

        setProducts(data.products)
        setLabel(
          profile.visitCount > 2
            ? 'Basado en tus intereses'
            : 'Productos que podrían interesarte'
        )

        // Mark returned products as seen (anti-repetition)
        const ids     = data.products.map(p => p.id).filter(Boolean) as string[]
        const updated = addToSeen(profile, ids)
        saveProfile(updated)
      } catch {
        // Fetch failed — section stays hidden
      }
    }

    void fetchPersonalized()
    return () => { cancelled = true }
  }, [])

  const handleAmazonClick = useCallback((productId: string) => {
    trackSessionEvent({ type: 'recommendation_click', productId, ts: Date.now() })
  }, [])

  // Hidden until we have data (no layout shift)
  if (!products || products.length === 0) return null

  return (
    <section className="animate-in fade-in duration-500">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-purple-500" />
        <h2 className="text-xl font-bold text-gray-800">{label}</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {products.map(product => (
          <MiniCard
            key={product.id}
            product={product}
            onAmazonClick={handleAmazonClick}
          />
        ))}
      </div>
    </section>
  )
}
