/**
 * BestImportsSection — confirmed Colombia-shippable products for the homepage.
 *
 * Surfaces products where shipsToColombiaConfirmed === true, sorted by
 * intelligence rank. These are the best verified imports Colombian buyers
 * can actually order from Amazon.
 *
 * Visibility:
 *   When at least one product has shipsToColombiaConfirmed === true → shows.
 *   Before the Colombia audit runs (no confirmed products yet) → returns null.
 *
 * The info strip reinforces trust by explaining these products have
 * verified international shipping to Colombia.
 */

import { PackageCheck } from 'lucide-react'
import { ProductGrid } from './ProductGrid'
import { getBestImports } from '@/data/products'
import { buildCopPriceMap } from '@/lib/currency'
import { getCachedSnapshot } from '@/lib/catalog/intelligence/snapshot'
import { buildDynamicBadgeMap } from '@/lib/catalog/badges'

interface BestImportsSectionProps {
  limit?: number
}

export function BestImportsSection({ limit = 8 }: BestImportsSectionProps) {
  const imports = getBestImports(limit)
  if (imports.length === 0) return null

  const copPrices     = buildCopPriceMap(imports)
  const dynamicBadges = buildDynamicBadgeMap(imports, getCachedSnapshot())

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <PackageCheck className="h-5 w-5 text-teal-500" />
        <h2 className="text-xl font-bold text-gray-800">Mejores importaciones</h2>
      </div>

      {/* Trust strip — explains why these products are curated */}
      <div className="bg-gradient-to-r from-teal-50 to-blue-50 border border-teal-100 rounded-xl p-3 mb-4 flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">🇨🇴</span>
        <div>
          <p className="text-sm font-semibold text-gray-800">Envío confirmado a Colombia</p>
          <p className="text-xs text-gray-500">
            Productos verificados con disponibilidad de envío internacional desde Amazon
          </p>
        </div>
      </div>

      <ProductGrid
        products={imports}
        columns={4}
        copPrices={copPrices}
        dynamicBadges={dynamicBadges}
      />
    </section>
  )
}
