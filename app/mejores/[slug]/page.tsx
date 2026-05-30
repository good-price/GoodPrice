import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, ExternalLink } from 'lucide-react'

import { getMejoresPage, getAllMejoresSlugs } from '@/data/programmatic/mejores'
import { getCompararPage } from '@/data/programmatic/comparar'
import { getGuide } from '@/data/guides'
import { getPublicProducts } from '@/lib/catalog/public'

import { ProductCard } from '@/components/ProductCard'
import { MejoresHero } from '@/components/programmatic/MejoresHero'

import { FAQAccordion } from '@/components/category/FAQAccordion'

import {
  buildMejoresMetadata,
  mejoresArticleSchema,
  mejoresItemListSchema,
  programmaticFaqSchema,
} from '@/lib/programmatic/seo'
import { breadcrumbSchema, SITE_URL } from '@/lib/seo'

import type { Guide } from '@/types'

interface PageProps {
  params: { slug: string }
}

// ── Static generation ─────────────────────────────────────────────────────────

export const revalidate = 86400
export const dynamicParams = false

export function generateStaticParams() {
  return getAllMejoresSlugs().map(slug => ({ slug }))
}

export function generateMetadata({ params }: PageProps): Metadata {
  const page = getMejoresPage(params.slug)
  if (!page) return {}
  return buildMejoresMetadata(page)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MejoresPage({ params }: PageProps) {
  const page = getMejoresPage(params.slug)
  if (!page) notFound()

  const allProducts = getPublicProducts()

  // Resolve featured products (skip unknown IDs silently)
  const featuredProducts = page.featuredProductIds
    .map(id => allProducts.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)

  // Resolve related guides
  const relatedGuides = page.relatedGuideSlugs
    .map(slug => getGuide(slug))
    .filter((g): g is Guide => g !== undefined)

  // Resolve related comparisons (slug + title lookup)
  const relatedComparisons = page.relatedComparisonSlugs
    .map(slug => getCompararPage(slug))
    .filter(Boolean)

  // Build JSON-LD
  const pageUrl = `${SITE_URL}/mejores/${page.slug}`

  const articleLd    = mejoresArticleSchema(page)
  const itemListLd   = mejoresItemListSchema(page, featuredProducts)
  const faqLd        = programmaticFaqSchema(page.faqs)
  const breadcrumbLd = breadcrumbSchema([
    { name: 'Inicio',   url: SITE_URL },
    { name: 'Mejores',  url: `${SITE_URL}/mejores` },
    { name: page.title, url: pageUrl },
  ])

  return (
    <>
      {/* ── JSON-LD structured data ───────────────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
      {page.faqs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <article>
        {/* ── Breadcrumb ───────────────────────────────────────────────── */}
        <nav
          aria-label="breadcrumb"
          className="flex items-center gap-1 text-xs text-gray-400 mb-4 flex-wrap"
        >
          <Link href="/" className="hover:text-[#F7A823] transition-colors">
            Inicio
          </Link>
          <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="text-gray-500">Mejores</span>
          <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="text-gray-600 font-medium truncate max-w-[200px]">{page.title}</span>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <MejoresHero page={page} productCount={featuredProducts.length} />

        <div className="space-y-6">
          {/* ── Editorial intro ───────────────────────────────────────── */}
          <section
            aria-label="Introducción editorial"
            className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm"
          >
            <div className="prose prose-sm max-w-none text-gray-700">
              {page.intro.split(/\n\n+/).map((para, i) => (
                <p key={i} className="leading-relaxed mb-4 last:mb-0">
                  {para}
                </p>
              ))}
            </div>
          </section>

          {/* ── Featured products ─────────────────────────────────────── */}
          {featuredProducts.length > 0 && (
            <section aria-label="Productos destacados">
              <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span aria-hidden="true">⭐</span>
                Nuestra selección
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {featuredProducts.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {/* ── Related comparisons ───────────────────────────────────── */}
          {relatedComparisons.length > 0 && (
            <section aria-label="Comparativas relacionadas">
              <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span aria-hidden="true">⚖️</span>
                Comparativas relacionadas
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {relatedComparisons.map(comp => (
                  <Link
                    key={comp!.slug}
                    href={`/comparar/${comp!.slug}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm hover:border-[#F7A823] hover:shadow-md transition-all group"
                  >
                    <span className="text-sm font-semibold text-gray-800 group-hover:text-[#F7A823] transition-colors leading-snug">
                      {comp!.title}
                    </span>
                    <ExternalLink className="h-4 w-4 text-gray-300 group-hover:text-[#F7A823] flex-shrink-0 transition-colors" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Related guides ────────────────────────────────────────── */}
          {relatedGuides.length > 0 && (
            <section aria-label="Guías de compra relacionadas">
              <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span aria-hidden="true">📖</span>
                Guías de compra
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {relatedGuides.map(guide => (
                  <Link
                    key={guide.slug}
                    href={`/guias/${guide.slug}`}
                    className="flex items-start gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3.5 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 group-hover:text-emerald-600 transition-colors leading-snug">
                        {guide.title}
                      </p>
                      {guide.headline && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{guide.headline}</p>
                      )}
                    </div>
                    <ExternalLink className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 flex-shrink-0 mt-0.5 transition-colors" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── FAQ ───────────────────────────────────────────────────── */}
          {page.faqs.length > 0 && (
            <FAQAccordion faqs={page.faqs} />
          )}

          {/* ── Affiliate disclosure ───────────────────────────────────── */}
          <footer className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 leading-relaxed">
              <strong className="text-gray-500">Divulgación de afiliado:</strong>{' '}
              GOODPRICE participa en el programa Amazon Associates. Si compras a través
              de los enlaces de esta página, recibimos una pequeña comisión sin costo
              adicional para ti. Los precios mostrados son los vigentes en Amazon al momento
              de la última validación y pueden variar. Comprueba siempre el precio final
              en Amazon antes de comprar.
            </p>
          </footer>
        </div>
      </article>
    </>
  )
}
