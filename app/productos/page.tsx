import { Metadata } from 'next'
import { products, searchProducts } from '@/data/products'
import { ProductsClient } from '@/components/ProductsClient'
import { buildCopPriceMap } from '@/lib/currency'
import { buildCatalogMetadata } from '@/lib/seo'

export const revalidate = 86400

export const metadata: Metadata = buildCatalogMetadata()

interface PageProps {
  searchParams: { q?: string }
}

export default function ProductosPage({ searchParams }: PageProps) {
  const query     = searchParams.q?.trim() ?? ''
  const data      = query ? searchProducts(query) : products
  const copPrices = buildCopPriceMap(data)
  const title     = query ? `Resultados para "${query}"` : 'Todos los productos'

  return <ProductsClient products={data} title={title} copPrices={copPrices} />
}
