import { ProductCard } from '@/components/ProductCard'
import type { Product } from '@/types'

interface RelatedProductsProps {
  products: Product[]
  title?: string
}

export function RelatedProducts({
  products,
  title = 'Productos relacionados',
}: RelatedProductsProps) {
  if (!products.length) return null

  return (
    <section aria-label={title}>
      <h2 className="text-base font-bold text-gray-800 mb-4">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map(p => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  )
}
