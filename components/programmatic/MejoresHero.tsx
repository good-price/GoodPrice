import { Calendar, Star } from 'lucide-react'
import type { MejoresPage } from '@/types'

interface MejoresHeroProps {
  page: MejoresPage
  productCount: number
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function MejoresHero({ page, productCount }: MejoresHeroProps) {
  return (
    <section
      aria-label={`Sección de presentación: ${page.title}`}
      className="rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-[#1a1f2e] via-[#1e2438] to-[#2a3050]"
    >
      <div
        className="relative px-6 py-8 sm:px-10 sm:py-10"
        style={{
          backgroundImage:
            'radial-gradient(circle at 85% 15%, rgba(247,168,35,0.08) 0%, transparent 50%), ' +
            'radial-gradient(circle at 15% 85%, rgba(52,211,153,0.06) 0%, transparent 50%)',
        }}
      >
        {/* Badge + intent chip */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {page.badge && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {page.badge}
            </span>
          )}
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
            <Star className="h-3 w-3" aria-hidden="true" />
            Selección editorial
          </span>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight mb-3">
          {page.title}
        </h1>

        {/* Tagline */}
        <p className="text-gray-300 text-base sm:text-lg leading-relaxed max-w-2xl mb-6">
          {page.tagline}
        </p>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/8 border border-white/12 backdrop-blur-sm px-4 py-3">
            <p className="text-lg font-bold text-white leading-tight">{productCount}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Productos seleccionados</p>
          </div>
          <div className="rounded-xl bg-white/8 border border-white/12 backdrop-blur-sm px-4 py-3">
            <p className="text-lg font-bold text-emerald-400 leading-tight">✓ Verificado</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Envío a Colombia</p>
          </div>
          <div className="rounded-xl bg-white/8 border border-white/12 backdrop-blur-sm px-4 py-3">
            <p className="text-lg font-bold text-amber-400 leading-tight">Amazon</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Precios actualizados</p>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-white/10 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            Actualizado: {formatDate(page.updatedAt)}
          </span>
          <span>·</span>
          <span>Publicado: {formatDate(page.publishedAt)}</span>
          <span>·</span>
          <span className="text-emerald-500">Análisis independiente</span>
        </div>
      </div>
    </section>
  )
}
