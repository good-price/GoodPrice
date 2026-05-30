import Link from 'next/link'
import { Tag, ChevronRight } from 'lucide-react'
import { ProductGrid } from './ProductGrid'
import { getOffers } from '@/data/products'
import { buildCopPriceMap } from '@/lib/currency'
import { getCachedSnapshot } from '@/lib/catalog/intelligence/snapshot'
import { buildDynamicBadgeMap } from '@/lib/catalog/badges'

interface OffersSectionProps {
  limit?: number
}

export function OffersSection({ limit = 8 }: OffersSectionProps) {
  const offers        = getOffers(limit)
  const copPrices     = buildCopPriceMap(offers)
  const dynamicBadges = buildDynamicBadgeMap(offers, getCachedSnapshot())

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-red-500" />
          <h2 className="text-xl font-bold text-gray-800">Ofertas del día</h2>
        </div>
        <Link
          href="/ofertas"
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Ver todas <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {/* Offer banner strip */}
      <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-100 rounded-xl p-3 mb-4 flex items-center gap-3">
        <span className="text-2xl">🔥</span>
        <div>
          <p className="text-sm font-semibold text-gray-800">Ofertas por tiempo limitado</p>
          <p className="text-xs text-gray-500">Precios rebajados directamente en Amazon</p>
        </div>
      </div>
      <ProductGrid products={offers} columns={4} copPrices={copPrices} dynamicBadges={dynamicBadges} />
    </section>
  )
}
