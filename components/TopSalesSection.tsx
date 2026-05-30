import Link from 'next/link'
import { TrendingUp, ChevronRight } from 'lucide-react'
import { ProductGrid } from './ProductGrid'
import { getTopSellers } from '@/data/products'
import { buildCopPriceMap } from '@/lib/currency'
import { getCachedSnapshot } from '@/lib/catalog/intelligence/snapshot'
import { buildDynamicBadgeMap } from '@/lib/catalog/badges'

interface TopSalesSectionProps {
  limit?: number
}

export function TopSalesSection({ limit = 8 }: TopSalesSectionProps) {
  const topSellers    = getTopSellers(limit)
  const copPrices     = buildCopPriceMap(topSellers)
  const dynamicBadges = buildDynamicBadgeMap(topSellers, getCachedSnapshot())

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-[#F7A823]" />
          <h2 className="text-xl font-bold text-gray-800">Top ventas</h2>
        </div>
        <Link
          href="/top-ventas"
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Ver todos <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <ProductGrid products={topSellers} columns={4} copPrices={copPrices} dynamicBadges={dynamicBadges} />
    </section>
  )
}
