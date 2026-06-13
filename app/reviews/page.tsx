import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getAllReviews } from '@/lib/content'
import { buildReviewsIndexMetadata } from '@/lib/seo/editorial'
import { breadcrumbSchema, SITE_URL } from '@/lib/seo'

export const revalidate = 86400

export function generateMetadata(): Metadata {
  return buildReviewsIndexMetadata()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const RATING_COLOR = (r: number) =>
  r >= 8 ? 'text-emerald-600 bg-emerald-50' :
  r >= 6 ? 'text-amber-700 bg-amber-50' :
           'text-red-600 bg-red-50'

export default function ReviewsPage() {
  const reviews = getAllReviews()

  const breadcrumbLd = breadcrumbSchema([
    { name: 'Inicio',   url: SITE_URL },
    { name: 'Reviews',  url: `${SITE_URL}/reviews` },
  ])

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <nav
          aria-label="breadcrumb"
          className="flex items-center gap-1 text-xs text-gray-400 mb-6 flex-wrap"
        >
          <Link href="/" className="hover:text-[#F7A823] transition-colors">
            Inicio
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="text-gray-600 font-medium">Reviews</span>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-extrabold text-gray-900 mb-2">
            Reviews de productos tech
          </h1>
          <p className="text-gray-500 text-[15px] leading-relaxed">
            Análisis honestos de productos disponibles en Amazon Colombia.
            Precio real, pros, contras y veredicto sin filtros.
          </p>
        </header>

        {/* List */}
        {reviews.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center shadow-sm">
            <p className="text-gray-400 text-sm">Los primeros reviews están en camino.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map(r => (
              <Link
                key={r.slug}
                href={`/reviews/${r.slug}`}
                className="flex items-center justify-between gap-4 bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:border-[#F7A823] hover:shadow-md transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${RATING_COLOR(r.frontmatter.rating)}`}
                    >
                      {r.frontmatter.rating}/10
                    </span>
                    {r.frontmatter.badge && (
                      <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {r.frontmatter.badge}
                      </span>
                    )}
                  </div>
                  <h2 className="text-sm font-semibold text-gray-800 group-hover:text-[#F7A823] leading-snug transition-colors">
                    {r.frontmatter.title}
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(r.frontmatter.publishDate)} · {r.readingTime} min
                  </p>
                </div>
                <ChevronRight
                  className="h-4 w-4 text-gray-300 group-hover:text-[#F7A823] flex-shrink-0 transition-colors"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
