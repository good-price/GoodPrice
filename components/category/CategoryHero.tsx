import Link from 'next/link'
import { Calendar } from 'lucide-react'
import type { CategoryPage } from '@/types'

interface CategoryHeroProps {
  page: CategoryPage
  productCount: number
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function CategoryHero({ page, productCount }: CategoryHeroProps) {
  return (
    <section
      aria-label={`Sección de presentación: ${page.name}`}
      className="rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-[#1a1f2e] via-[#1e2438] to-[#2a3050]"
    >
      {/* Subtle grid texture overlay */}
      <div
        className="relative px-6 py-8 sm:px-10 sm:py-10"
        style={{
          backgroundImage:
            'radial-gradient(circle at 80% 20%, rgba(247,168,35,0.07) 0%, transparent 50%), ' +
            'radial-gradient(circle at 20% 80%, rgba(52,211,153,0.05) 0%, transparent 50%)',
        }}
      >
        {/* Top row: icon + name + badge */}
        <div className="flex items-start gap-4 mb-4">
          <span
            className="text-5xl flex-shrink-0 filter drop-shadow-lg"
            aria-hidden="true"
          >
            {page.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {page.badge && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {page.badge}
                </span>
              )}
              {page.canonicalCategory && (
                <Link
                  href={`/categorias/${page.canonicalCategory}`}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 transition-colors"
                >
                  Ver catálogo →
                </Link>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              {page.name}
            </h1>
          </div>
        </div>

        {/* Tagline */}
        <p className="text-gray-300 text-base sm:text-lg leading-relaxed max-w-2xl mb-6">
          {page.tagline}
        </p>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {page.stats.map((stat, i) => (
            <div
              key={i}
              className="rounded-xl bg-white/8 border border-white/12 backdrop-blur-sm px-4 py-3"
            >
              <p className="text-lg font-bold text-white leading-tight">{stat.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-white/10 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            Actualizado: {formatDate(page.updatedAt)}
          </span>
          <span>·</span>
          <span>{productCount} producto{productCount !== 1 ? 's' : ''} destacado{productCount !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span className="text-emerald-500">✓ Envío a Colombia verificado</span>
        </div>
      </div>
    </section>
  )
}
