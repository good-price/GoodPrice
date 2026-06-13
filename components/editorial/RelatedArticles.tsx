import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { ArticleRef } from '@/types/editorial'

interface RelatedArticlesProps {
  articles: ArticleRef[]
  title?: string
}

const TYPE_CHIP: Record<ArticleRef['type'], string> = {
  review:     'text-blue-600 bg-blue-50',
  comparison: 'text-purple-600 bg-purple-50',
  guide:      'text-amber-700 bg-amber-50',
}

const TYPE_LABEL: Record<ArticleRef['type'], string> = {
  review:     'Review',
  comparison: 'Comparativa',
  guide:      'Guía',
}

export function RelatedArticles({
  articles,
  title = 'También te puede interesar',
}: RelatedArticlesProps) {
  if (!articles.length) return null

  return (
    <section aria-label={title}>
      <h2 className="text-base font-bold text-gray-800 mb-3">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {articles.map(article => (
          <Link
            key={article.href}
            href={article.href}
            className="flex items-center justify-between gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm hover:border-[#F7A823] hover:shadow-md transition-all group"
          >
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${TYPE_CHIP[article.type]}`}
              >
                {TYPE_LABEL[article.type]}
              </span>
              <span className="text-sm font-medium text-gray-800 group-hover:text-[#F7A823] leading-snug transition-colors line-clamp-2">
                {article.title}
              </span>
            </div>
            <ChevronRight
              className="h-4 w-4 text-gray-300 group-hover:text-[#F7A823] flex-shrink-0 transition-colors"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  )
}
