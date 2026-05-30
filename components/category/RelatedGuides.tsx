import Link from 'next/link'
import { ArrowRight, BookOpen } from 'lucide-react'
import type { Guide } from '@/types'

interface RelatedGuidesProps {
  guides: Guide[]
  categoryName: string
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  'buying-guide': { label: 'Guía de compra', color: 'bg-blue-500/20 text-blue-400' },
  'comparison':   { label: 'Comparativa',    color: 'bg-purple-500/20 text-purple-400' },
  'top-list':     { label: 'Top lista',       color: 'bg-amber-500/20 text-amber-400' },
}

export function RelatedGuides({ guides, categoryName }: RelatedGuidesProps) {
  if (guides.length === 0) return null

  return (
    <section aria-label="Guías relacionadas">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="h-4 w-4 text-emerald-400" aria-hidden="true" />
        <h2 className="text-base font-bold text-gray-800">
          Guías de compra para {categoryName}
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {guides.map(guide => {
          const typeInfo = TYPE_LABELS[guide.type] ?? {
            label: guide.type,
            color: 'bg-gray-500/20 text-gray-400',
          }

          return (
            <Link
              key={guide.slug}
              href={`/guias/${guide.slug}`}
              className={[
                'group flex flex-col gap-3 rounded-2xl p-5',
                'bg-[#1a1f2e] border border-white/10',
                'hover:border-emerald-500/40 hover:bg-[#1e2438]',
                'transition-all duration-200',
                // Subtle emerald glow on hover
                'hover:shadow-[0_0_20px_rgba(52,211,153,0.08)]',
              ].join(' ')}
            >
              {/* Type badge */}
              <span
                className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-full border border-transparent ${typeInfo.color}`}
              >
                {typeInfo.label}
              </span>

              {/* Title */}
              <h3 className="text-sm font-semibold text-gray-100 leading-snug group-hover:text-white transition-colors line-clamp-2">
                {guide.title}
              </h3>

              {/* Headline + CTA */}
              <div className="flex items-end justify-between gap-2 mt-auto">
                <p className="text-xs text-gray-500 line-clamp-1 flex-1">
                  {guide.headline}
                </p>
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 flex-shrink-0 group-hover:gap-2 transition-all">
                  Leer <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
