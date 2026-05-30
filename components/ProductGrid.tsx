import { Product } from '@/types'
import { ProductCard } from './ProductCard'

interface ProductGridProps {
  products: Product[]
  columns?: 2 | 3 | 4
  /** Number of leading cards whose images should have priority=true (LCP hint).
   *  Defaults to 0 — set to 4 on above-the-fold grids. */
  priorityCount?: number
  /**
   * Pre-formatted COP prices keyed by product ID.
   * Built server-side via buildCopPriceMap() — passed through to each ProductCard.
   * When absent, ProductCard falls back to USD-only display.
   */
  copPrices?: Record<string, string>
  /**
   * Dynamic badges keyed by product ID, computed server-side via buildDynamicBadgeMap().
   * Each entry overrides the static product.badge for that product.
   * Absent products in the map keep their static badge (or show none).
   */
  dynamicBadges?: Record<string, string>
}

const colClass = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
}

export function ProductGrid({
  products,
  columns = 4,
  priorityCount = 0,
  copPrices,
  dynamicBadges,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg font-medium">No se encontraron productos</p>
        <p className="text-sm mt-1">Prueba con otros filtros o términos de búsqueda</p>
      </div>
    )
  }

  return (
    <div className={`grid ${colClass[columns]} gap-3 md:gap-4`}>
      {products.map((product, i) => (
        <ProductCard
          key={product.id}
          product={product}
          priority={i < priorityCount}
          copPrice={copPrices?.[product.id ?? '']}
          dynamicBadge={dynamicBadges?.[product.id ?? '']}
        />
      ))}
    </div>
  )
}
