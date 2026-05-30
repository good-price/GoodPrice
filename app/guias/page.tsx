import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, ArrowRight } from 'lucide-react'
import { GUIDES } from '@/data/guides'
import { buildGuidesIndexMetadata } from '@/lib/seo'

export const revalidate = 86400

export const metadata: Metadata = buildGuidesIndexMetadata()

/** Label and color for each guide type */
const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  'buying-guide': { label: 'Guía de compra', color: 'bg-blue-100 text-blue-700' },
  'comparison':   { label: 'Comparativa',    color: 'bg-purple-100 text-purple-700' },
  'top-list':     { label: 'Top lista',       color: 'bg-amber-100 text-amber-700' },
}

export default function GuiasPage() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm">
        <BookOpen className="h-8 w-8 text-[#F7A823] flex-shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Guías de compra</h1>
          <p className="text-sm text-gray-400">
            Análisis honesto de los mejores productos en Amazon para Colombia
          </p>
        </div>
      </div>

      {GUIDES.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">✍️</p>
          <p className="text-lg font-medium">Próximamente</p>
          <p className="text-sm mt-1">Estamos preparando las primeras guías</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {GUIDES.map(guide => {
            const typeInfo = TYPE_LABELS[guide.type] ?? { label: guide.type, color: 'bg-gray-100 text-gray-600' }

            return (
              <Link
                key={guide.slug}
                href={`/guias/${guide.slug}`}
                className="group flex flex-col bg-white rounded-2xl border border-gray-100 p-6 hover:border-[#F7A823] hover:shadow-md transition-all duration-200"
              >
                {/* Type badge + optional badge chip */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${typeInfo.color}`}>
                    {typeInfo.label}
                  </span>
                  {guide.badge && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F7A823]/20 text-[#c27b00]">
                      {guide.badge}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h2 className="text-base font-bold text-gray-800 leading-snug group-hover:text-[#e8961a] transition-colors mb-2">
                  {guide.title}
                </h2>

                {/* Headline */}
                <p className="text-sm text-gray-500 leading-relaxed flex-1">
                  {guide.headline}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    {guide.productIds.length} producto{guide.productIds.length !== 1 ? 's' : ''} analizados
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium text-[#F7A823] group-hover:gap-2 transition-all">
                    Leer guía <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
