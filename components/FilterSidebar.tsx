'use client'

import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { FilterState, SortOption } from '@/types'
import { categories } from '@/data/categories'

interface FilterSidebarProps {
  filters: FilterState
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  resetFilters: () => void
  totalResults: number
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'price-asc', label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
  { value: 'rating', label: 'Mejor valorados' },
  { value: 'reviews', label: 'Más reviews' },
]

const ratingOptions = [4, 3, 2, 1]

export function FilterSidebar({ filters, updateFilter, resetFilters, totalResults }: FilterSidebarProps) {
  return (
    <aside className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 h-fit sticky top-20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-gray-600" />
          <span className="font-semibold text-gray-800 text-sm">Filtros</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          className="text-xs text-gray-400 hover:text-gray-600 gap-1 h-7 px-2"
        >
          <RotateCcw className="h-3 w-3" /> Limpiar
        </Button>
      </div>

      <p className="text-xs text-gray-400 mb-4">{totalResults} resultados</p>

      <Separator className="mb-4" />

      {/* Sort */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ordenar por</h3>
        <div className="flex flex-col gap-1">
          {sortOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => updateFilter('sortBy', opt.value)}
              className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${
                filters.sortBy === opt.value
                  ? 'bg-[#F7A823]/15 text-[#e8961a] font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Separator className="mb-4" />

      {/* Category */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Categoría</h3>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => updateFilter('category', '')}
            className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${
              filters.category === ''
                ? 'bg-[#F7A823]/15 text-[#e8961a] font-medium'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Todas
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => updateFilter('category', cat.slug)}
              className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
                filters.category === cat.slug
                  ? 'bg-[#F7A823]/15 text-[#e8961a] font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{cat.icon}</span> {cat.name}
            </button>
          ))}
        </div>
      </div>

      <Separator className="mb-4" />

      {/* Rating */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Valoración mínima</h3>
        <div className="flex flex-col gap-1">
          {ratingOptions.map(r => (
            <button
              key={r}
              onClick={() => updateFilter('minRating', r)}
              className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                filters.minRating === r
                  ? 'bg-[#F7A823]/15 text-[#e8961a] font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {'★'.repeat(r)}{'☆'.repeat(5 - r)} y más
            </button>
          ))}
        </div>
      </div>

      <Separator className="mb-4" />

      {/* Quick filters */}
      <div className="mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filtros rápidos</h3>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.isTopSeller}
              onChange={e => updateFilter('isTopSeller', e.target.checked)}
              className="accent-[#F7A823] h-4 w-4"
            />
            <span className="text-sm text-gray-700">Solo top ventas</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.isOffer}
              onChange={e => updateFilter('isOffer', e.target.checked)}
              className="accent-[#F7A823] h-4 w-4"
            />
            <span className="text-sm text-gray-700">Solo ofertas</span>
          </label>
        </div>
      </div>
    </aside>
  )
}
