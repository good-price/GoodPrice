'use client'

import { FilterSidebar } from './FilterSidebar'
import { ProductGrid } from './ProductGrid'
import { useFilter } from '@/hooks/useFilter'
import { Product } from '@/types'
import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

interface ProductsClientProps {
  products: Product[]
  title?: string
  /**
   * Pre-formatted COP prices keyed by product ID (computed server-side).
   * Passed through to ProductGrid → ProductCard for Colombia-first pricing display.
   */
  copPrices?: Record<string, string>
  /**
   * Dynamic badges keyed by product ID, computed server-side via buildDynamicBadgeMap().
   * Passed through to ProductGrid → ProductCard unchanged (map covers all products
   * in the category so it remains valid after client-side filter operations).
   */
  dynamicBadges?: Record<string, string>
}

export function ProductsClient({ products, title, copPrices, dynamicBadges }: ProductsClientProps) {
  const { filters, filtered, updateFilter, resetFilters } = useFilter(products)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div>
      {title && <h1 className="text-2xl font-bold text-gray-800 mb-5">{title}</h1>}

      {/* Mobile filter trigger */}
      <div className="flex md:hidden items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{filtered.length} resultados</p>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Filtros
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 overflow-y-auto">
            <div className="p-4">
              <FilterSidebar
                filters={filters}
                updateFilter={updateFilter}
                resetFilters={resetFilters}
                totalResults={filtered.length}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex gap-6">
        {/* Desktop sidebar */}
        <div className="hidden md:block w-56 flex-shrink-0">
          <FilterSidebar
            filters={filters}
            updateFilter={updateFilter}
            resetFilters={resetFilters}
            totalResults={filtered.length}
          />
        </div>

        {/* Grid */}
        <div className="flex-1 min-w-0">
          <ProductGrid products={filtered} columns={3} copPrices={copPrices} dynamicBadges={dynamicBadges} />
        </div>
      </div>
    </div>
  )
}
