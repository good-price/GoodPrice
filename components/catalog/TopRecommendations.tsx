/**
 * components/catalog/TopRecommendations.tsx
 *
 * Top 6 recommended products for a category, sorted by recommendationScore DESC.
 * Server Component — no hooks, no client state.
 *
 * Renders nothing if fewer than 2 products have recommendation data,
 * so the category page degrades gracefully before the first pipeline run.
 */

import Image from 'next/image'
import { getProductImageSrc } from '@/lib/catalog/placeholders'
import { readRecommendations } from '@/lib/catalog/recommendations/state'
import { getPublicCategoryProducts } from '@/lib/catalog/public'
import { formatCOP, getCachedRate } from '@/lib/currency'
import type { Product } from '@/types'

interface Props {
  category: string
  /** Maximum products to show — default 6 */
  count?:   number
}

interface RecommendedItem {
  product:             Product
  recommendationScore: number
}

function getTopRecommended(category: string, count: number): RecommendedItem[] {
  try {
    const products        = getPublicCategoryProducts(category)
    const recommendations = readRecommendations()

    const items: RecommendedItem[] = products
      .filter(p => p.asin && recommendations.products[p.asin!])
      .map(p => ({
        product:             p,
        recommendationScore: recommendations.products[p.asin!].recommendationScore,
      }))
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, count)

    return items
  } catch {
    return []
  }
}

export function TopRecommendations({ category, count = 6 }: Props) {
  const items = getTopRecommended(category, count)
  if (items.length < 2) return null  // degrade gracefully

  const rate = getCachedRate()

  return (
    <section aria-labelledby="top-rec-heading" className="mb-6">
      <h2
        id="top-rec-heading"
        className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2"
      >
        <span aria-hidden="true">⭐</span>
        Mejores recomendaciones
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map(({ product, recommendationScore }) => {
          const imageSrc = getProductImageSrc(product.image, product.category)
          const copPrice = formatCOP(product.price * rate)
          const href     = `/productos/${product.asin}`

          return (
            <a
              key={product.id}
              href={href}
              className="group bg-white rounded-xl border border-gray-100 shadow-sm p-3 hover:shadow-md hover:border-gray-200 transition-all flex flex-col gap-2"
              aria-label={`${product.title} — Score ${recommendationScore}`}
            >
              {/* Image */}
              <div className="relative aspect-square bg-gray-50 rounded-lg overflow-hidden">
                <Image
                  src={imageSrc}
                  alt={product.title}
                  fill
                  className="object-contain p-2 group-hover:scale-105 transition-transform"
                  sizes="(max-width: 640px) 50vw, 33vw"
                  unoptimized
                />
              </div>

              {/* Title */}
              <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-snug">
                {product.shortTitle ?? product.title}
              </p>

              {/* Price + score */}
              <div className="flex items-center justify-between mt-auto">
                <span className="text-sm font-bold text-gray-900">{copPrice}</span>
                <span
                  className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 tabular-nums"
                  title="Score de recomendación"
                  aria-label={`Score de recomendación: ${recommendationScore}`}
                >
                  {recommendationScore}
                </span>
              </div>
            </a>
          )
        })}
      </div>
    </section>
  )
}
