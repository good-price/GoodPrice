/**
 * TrendingSection — intelligence-promoted products for the homepage.
 *
 * Surfaces products from the intelligence promotion queue (snapshot.promotedIds)
 * so the highest-converting, most-engaged products are visible immediately.
 *
 * Visibility:
 *   When a snapshot exists and has promoted products → shows the section.
 *   When no snapshot or no promoted products → shows the top-seller fallback
 *   from getTrending(). If even that is empty → returns null (section hidden).
 *
 * All products receive "En tendencia" dynamic badges because every product
 * in this section is in the promotion queue by definition.
 */

import { Flame } from 'lucide-react'
import { ProductGrid } from './ProductGrid'
import { getTrending } from '@/data/products'
import { buildCopPriceMap } from '@/lib/currency'
import { getCachedSnapshot } from '@/lib/catalog/intelligence/snapshot'
import { buildDynamicBadgeMap } from '@/lib/catalog/badges'

interface TrendingSectionProps {
  limit?: number
}

export function TrendingSection({ limit = 8 }: TrendingSectionProps) {
  const trending = getTrending(limit)
  if (trending.length === 0) return null

  const copPrices     = buildCopPriceMap(trending)
  const dynamicBadges = buildDynamicBadgeMap(trending, getCachedSnapshot())

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Flame className="h-5 w-5 text-orange-500" />
        <h2 className="text-xl font-bold text-gray-800">Productos en tendencia</h2>
      </div>
      <ProductGrid
        products={trending}
        columns={4}
        copPrices={copPrices}
        dynamicBadges={dynamicBadges}
      />
    </section>
  )
}
