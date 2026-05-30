import { Metadata } from 'next'
import { getOffers } from '@/data/products'
import { ProductsClient } from '@/components/ProductsClient'
import { Tag } from 'lucide-react'
import { buildCopPriceMap } from '@/lib/currency'
import { buildOffersMetadata } from '@/lib/seo'

export const revalidate = 86400

export const metadata: Metadata = buildOffersMetadata()

export default function OfertasPage() {
  const offers    = getOffers()
  const copPrices = buildCopPriceMap(offers)

  return (
    <div>
      {/* Banner */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-6 mb-6 flex items-center gap-4 text-white">
        <Tag className="h-8 w-8 flex-shrink-0" />
        <div>
          <h1 className="text-2xl font-extrabold">Ofertas del día</h1>
          <p className="text-orange-100 text-sm mt-0.5">Descuentos reales directamente en Amazon</p>
        </div>
        <span className="ml-auto text-3xl">🔥</span>
      </div>
      <ProductsClient products={offers} copPrices={copPrices} />
    </div>
  )
}
