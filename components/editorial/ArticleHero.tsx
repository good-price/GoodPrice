import { Calendar, Clock } from 'lucide-react'

export type ArticleType = 'review' | 'comparison' | 'guide'

interface ArticleHeroProps {
  title: string
  excerpt: string
  publishDate: string
  updatedDate: string
  readingTime: number
  type: ArticleType
  badge?: string
}

const TYPE_LABELS: Record<ArticleType, string> = {
  review: 'Review',
  comparison: 'Comparativa',
  guide: 'Guía de compra',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function ArticleHero({
  title,
  excerpt,
  publishDate,
  updatedDate,
  readingTime,
  type,
  badge,
}: ArticleHeroProps) {
  return (
    <header className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 shadow-sm">
      {/* Type + badge chips */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F7A823]/20 text-[#c27b00]">
          {TYPE_LABELS[type]}
        </span>
        {badge && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            {badge}
          </span>
        )}
      </div>

      <h1 className="text-2xl font-extrabold text-gray-900 leading-tight mb-2">
        {title}
      </h1>
      <p className="text-base text-gray-500 mb-4">{excerpt}</p>

      {/* Meta row */}
      <div className="flex items-center gap-4 text-xs text-gray-400 border-t border-gray-100 pt-4 flex-wrap">
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          {formatDate(publishDate)}
        </span>
        {updatedDate !== publishDate && (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Actualizado: {formatDate(updatedDate)}
          </span>
        )}
        <span className="ml-auto">{readingTime} min lectura</span>
      </div>
    </header>
  )
}
