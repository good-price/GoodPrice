import { Metadata } from 'next'
import { getTopSellers } from '@/data/products'
import { ProductsClient } from '@/components/ProductsClient'
import { TrendingUp } from 'lucide-react'
import { buildCopPriceMap } from '@/lib/currency'
import { buildTopSellersMetadata } from '@/lib/seo'

export const revalidate = 86400

export const metadata: Metadata = buildTopSellersMetadata()

export default function TopVentasPage() {
  const topSellers = getTopSellers()
  const copPrices  = buildCopPriceMap(topSellers)

  return (
    <div>
      {/* Banner */}
      <div className="bg-gradient-to-r from-[#1a1f2e] to-[#2d3550] rounded-2xl p-6 mb-6 flex items-center gap-4 text-white">
        <TrendingUp className="h-8 w-8 flex-shrink-0 text-[#F7A823]" />
        <div>
          <h1 className="text-2xl font-extrabold">Top ventas</h1>
          <p className="text-gray-300 text-sm mt-0.5">Los más vendidos en Amazon ahora mismo</p>
        </div>
        <span className="ml-auto text-3xl">🏆</span>
      </div>
      <ProductsClient products={topSellers} copPrices={copPrices} />
    </div>
  )
}
