import { Calendar, ArrowLeftRight } from 'lucide-react'
import type { CompararPage, Product } from '@/types'

interface CompararHeroProps {
  page: CompararPage
  productA: Product
  productB: Product
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function CompararHero({ page, productA, productB }: CompararHeroProps) {
  return (
    <section
      aria-label="Comparativa: productos enfrentados"
      className="rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-[#1a1f2e] via-[#1e2438] to-[#2a3050]"
    >
      <div
        className="relative px-6 py-8 sm:px-10 sm:py-10"
        style={{
          backgroundImage:
            'radial-gradient(circle at 90% 10%, rgba(247,168,35,0.07) 0%, transparent 50%), ' +
            'radial-gradient(circle at 10% 90%, rgba(52,211,153,0.05) 0%, transparent 50%)',
        }}
      >
        {/* Chip */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 flex items-center gap-1">
            <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
            Comparativa
          </span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
            ✓ Envío a Colombia
          </span>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight mb-6">
          {page.title}
        </h1>

        {/* Product cards side by side */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-5">
          {/* Product A */}
          <div className="rounded-xl bg-white/8 border border-white/15 backdrop-blur-sm px-4 py-4 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Opción A</span>
            <p className="text-sm font-bold text-white leading-snug line-clamp-2">
              {productA.title}
            </p>
            <p className="text-xl font-extrabold text-amber-400">${productA.price.toFixed(2)}</p>
            <div className="flex items-center gap-1 text-yellow-400 text-xs">
              {'★'.repeat(Math.round(productA.rating))}
              <span className="text-gray-400 ml-1">({productA.reviews.toLocaleString()})</span>
            </div>
          </div>

          {/* VS divider */}
          <div className="col-start-1 col-end-3 flex items-center justify-center -my-2 z-10 pointer-events-none">
            {/* This is visually positioned between the two cards using absolute */}
          </div>

          {/* Product B */}
          <div className="rounded-xl bg-white/8 border border-white/15 backdrop-blur-sm px-4 py-4 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Opción B</span>
            <p className="text-sm font-bold text-white leading-snug line-clamp-2">
              {productB.title}
            </p>
            <p className="text-xl font-extrabold text-amber-400">${productB.price.toFixed(2)}</p>
            <div className="flex items-center gap-1 text-yellow-400 text-xs">
              {'★'.repeat(Math.round(productB.rating))}
              <span className="text-gray-400 ml-1">({productB.reviews.toLocaleString()})</span>
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 pt-4 border-t border-white/10 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            Actualizado: {formatDate(page.updatedAt)}
          </span>
          <span>·</span>
          <span>{page.comparisonRows.length} criterios comparados</span>
          <span>·</span>
          <span className="text-emerald-500">Análisis independiente</span>
        </div>
      </div>
    </section>
  )
}
