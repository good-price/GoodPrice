import Link from 'next/link'
import { ArrowRight, Compass } from 'lucide-react'
import type { RelatedCategoryRef } from '@/types'

interface RelatedCategoriesProps {
  categories: RelatedCategoryRef[]
  popularComparisons: string[]
  trendingQueries: string[]
}

export function RelatedCategories({
  categories,
  popularComparisons,
  trendingQueries,
}: RelatedCategoriesProps) {
  const hasContent =
    categories.length > 0 ||
    popularComparisons.length > 0 ||
    trendingQueries.length > 0

  if (!hasContent) return null

  return (
    <section
      aria-label="Explora más categorías y comparativas"
      className="rounded-2xl bg-[#1a1f2e] border border-white/10 overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-white/10">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Compass className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          Explora más
        </h2>
      </div>

      <div className="p-6 grid sm:grid-cols-3 gap-6">
        {/* Related categories */}
        {categories.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              Categorías relacionadas
            </p>
            <div className="flex flex-col gap-1.5">
              {categories.map(cat => (
                <Link
                  key={cat.slug}
                  href={`/categoria/${cat.slug}`}
                  className={[
                    'group flex items-center gap-2 px-3 py-2 rounded-xl',
                    'text-sm text-gray-300 hover:text-white',
                    'bg-white/5 hover:bg-white/10',
                    'border border-transparent hover:border-white/15',
                    'transition-all duration-150',
                  ].join(' ')}
                >
                  <span className="text-base" aria-hidden="true">{cat.icon}</span>
                  <span className="flex-1">{cat.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-600 group-hover:text-amber-400 transition-colors" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Popular comparisons */}
        {popularComparisons.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              Comparativas populares
            </p>
            <div className="flex flex-col gap-2">
              {popularComparisons.map((comp, i) => (
                <p
                  key={i}
                  className="text-xs text-gray-400 leading-snug flex items-start gap-1.5"
                >
                  <span className="text-amber-500 mt-0.5" aria-hidden="true">vs</span>
                  {comp}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Trending queries */}
        {trendingQueries.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              Búsquedas frecuentes
            </p>
            <div className="flex flex-wrap gap-2">
              {trendingQueries.map(q => (
                <a
                  key={q}
                  href={`/productos?q=${encodeURIComponent(q)}`}
                  className={[
                    'text-xs px-2.5 py-1 rounded-full',
                    'bg-white/8 text-gray-400 hover:text-gray-200',
                    'border border-white/10 hover:border-white/20',
                    'transition-colors duration-150',
                  ].join(' ')}
                >
                  # {q}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
