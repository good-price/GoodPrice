import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, ExternalLink } from 'lucide-react'

import { getCategoryPage, getAllCategoryPageSlugs } from '@/data/category-pages'
import { getGuide } from '@/data/guides'
import { getPublicProducts } from '@/lib/catalog/public'

import { ProductCard } from '@/components/ProductCard'
import { CategoryHero } from '@/components/category/CategoryHero'
import { FAQAccordion } from '@/components/category/FAQAccordion'
import { RelatedGuides } from '@/components/category/RelatedGuides'
import { RelatedCategories } from '@/components/category/RelatedCategories'

import {
  buildCategoryPageMetadata,
  faqPageSchema,
  categoryItemListSchema,
  categoryCollectionSchema,
  breadcrumbSchema,
  SITE_URL,
} from '@/lib/seo'

import type { Guide } from '@/types'

interface PageProps {
  params: { slug: string }
}

// ── Static generation ─────────────────────────────────────────────────────────

export const revalidate = 86400

/**
 * Only pre-render slugs that exist in the registry.
 * Unknown slugs return 404 (enforced by dynamicParams = false).
 */
export const dynamicParams = false

export function generateStaticParams() {
  return getAllCategoryPageSlugs().map(slug => ({ slug }))
}

export function generateMetadata({ params }: PageProps): Metadata {
  const page = getCategoryPage(params.slug)
  if (!page) return {}
  return buildCategoryPageMetadata(page)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CategoriaPage({ params }: PageProps) {
  const page = getCategoryPage(params.slug)
  if (!page) notFound()

  // Resolve featured products from catalog (skip unknown IDs silently)
  const allProducts = getPublicProducts()
  const featuredProducts = page.featuredProductIds
    .map(id => allProducts.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)

  // Resolve related guides
  const relatedGuides = page.relatedGuideSlugs
    .map(slug => getGuide(slug))
    .filter((g): g is Guide => g !== undefined)

  // Build JSON-LD
  const pageUrl = `${SITE_URL}/categoria/${page.slug}`

  const collectionLd  = categoryCollectionSchema(page)
  const itemListLd    = categoryItemListSchema(page, featuredProducts)
  const faqLd         = faqPageSchema(page.faqs)
  const breadcrumbLd  = breadcrumbSchema([
    { name: 'Inicio',       url: SITE_URL },
    { name: 'Categorías',   url: `${SITE_URL}/categorias` },
    { name: page.name,      url: pageUrl },
  ])

  return (
    <>
      {/* ── JSON-LD structured data (4 schemas) ─────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
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
          <Link href="/categorias" className="hover:text-[#F7A823] transition-colors">
            Categorías
          </Link>
          <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="text-gray-600 font-medium">{page.name}</span>
        </nav>

        {/* ── Hero + Stats ─────────────────────────────────────────────── */}
        <CategoryHero page={page} productCount={featuredProducts.length} />

        <div className="space-y-6">
          {/* ── Editorial intro ───────────────────────────────────────── */}
          <section
            aria-label="Introducción"
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <span aria-hidden="true">⭐</span>
                  Productos destacados
                </h2>
                {page.canonicalCategory && (
                  <Link
                    href={`/categorias/${page.canonicalCategory}`}
                    className="text-xs text-[#F7A823] hover:text-[#e8961a] font-medium flex items-center gap-1 transition-colors"
                  >
                    Ver todo el catálogo
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {featuredProducts.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {/* ── Related guides ────────────────────────────────────────── */}
          {relatedGuides.length > 0 && (
            <RelatedGuides guides={relatedGuides} categoryName={page.name} />
          )}

          {/* ── FAQ accordion ─────────────────────────────────────────── */}
          {page.faqs.length > 0 && (
            <FAQAccordion faqs={page.faqs} />
          )}

          {/* ── Discovery: related categories + comparisons + queries ─── */}
          <RelatedCategories
            categories={page.relatedCategories}
            popularComparisons={page.popularComparisons}
            trendingQueries={page.trendingQueries}
          />

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
