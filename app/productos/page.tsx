import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { readSiteMode } from '@/lib/system/site-mode'
import { products, searchProducts } from '@/data/products'
import { ProductsClient } from '@/components/ProductsClient'
import { buildCopPriceMap } from '@/lib/currency'
import { buildCatalogMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildCatalogMetadata()

interface PageProps {
  searchParams: { q?: string }
}

export default function ProductosPage({ searchParams }: PageProps) {
  const { mode } = readSiteMode()
  if (mode === 'development') redirect('/en-desarrollo')

  const query     = searchParams.q?.trim() ?? ''
  const data      = query ? searchProducts(query) : products
  const copPrices = buildCopPriceMap(data)
  const title     = query ? `Resultados para "${query}"` : 'Todos los productos'

  return <ProductsClient products={data} title={title} copPrices={copPrices} />
}
