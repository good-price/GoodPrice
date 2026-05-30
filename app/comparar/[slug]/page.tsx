import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

import { getCompararPage, getAllCompararSlugs } from '@/data/programmatic/comparar'
import { getPublicProducts } from '@/lib/catalog/public'

import { CompararHero } from '@/components/programmatic/CompararHero'
import { ComparisonTable } from '@/components/programmatic/ComparisonTable'
import { ProsConsCard } from '@/components/programmatic/ProsConsCard'
import { VerdictBanner } from '@/components/programmatic/VerdictBanner'
import { FAQAccordion } from '@/components/category/FAQAccordion'

import {
  buildCompararMetadata,
  compararArticleSchema,
  compararProductSchemas,
  programmaticFaqSchema,
} from '@/lib/programmatic/seo'
import { breadcrumbSchema, SITE_URL } from '@/lib/seo'

interface PageProps {
  params: { slug: string }
}

// ── Static generation ─────────────────────────────────────────────────────────

export const revalidate = 86400
export const dynamicParams = false

export function generateStaticParams() {
  return getAllCompararSlugs().map(slug => ({ slug }))
}

export function generateMetadata({ params }: PageProps): Metadata {
  const page = getCompararPage(params.slug)
  if (!page) return {}
  return buildCompararMetadata(page)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CompararPageRoute({ params }: PageProps) {
  const page = getCompararPage(params.slug)
  if (!page) notFound()

  const allProducts = getPublicProducts()

  const productA = allProducts.find(p => p.id === page.productAId)
  const productB = allProducts.find(p => p.id === page.productBId)

  // If either product is missing from catalog, 404 gracefully
  if (!productA || !productB) notFound()

  // Resolve related comparisons (other vs pages)
  const relatedComparisons = page.relatedComparisonSlugs
    .map(slug => getCompararPage(slug))
    .filter(Boolean)

  // Build JSON-LD
  const pageUrl = `${SITE_URL}/comparar/${page.slug}`

  const articleLd       = compararArticleSchema(page)
  const [productALd, productBLd] = compararProductSchemas(productA, productB)
  const faqLd           = programmaticFaqSchema(page.faqs)
  const breadcrumbLd    = breadcrumbSchema([
    { name: 'Inicio',   url: SITE_URL },
    { name: 'Comparar', url: `${SITE_URL}/comparar` },
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productALd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productBLd) }}
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
          <span className="text-gray-500">Comparar</span>
          <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="text-gray-600 font-medium truncate max-w-[200px]">{page.title}</span>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <CompararHero page={page} productA={productA} productB={productB} />

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

          {/* ── Comparison table ──────────────────────────────────────── */}
          <ComparisonTable
            rows={page.comparisonRows}
            productA={productA}
            productB={productB}
          />

          {/* ── Pros & cons ───────────────────────────────────────────── */}
          <section aria-label="Pros y contras de cada opción">
            <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span aria-hidden="true">⚖️</span>
              Pros y contras
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <ProsConsCard
                product={productA}
                pros={page.productAPros}
                cons={page.productACons}
                label="A"
              />
              <ProsConsCard
                product={productB}
                pros={page.productBPros}
                cons={page.productBCons}
                label="B"
              />
            </div>
          </section>

          {/* ── Verdict banner ────────────────────────────────────────── */}
          <VerdictBanner
            verdict={page.verdict}
            winner={page.verdictWinner}
            productA={productA}
            productB={productB}
          />

          {/* ── FAQ ───────────────────────────────────────────────────── */}
          {page.faqs.length > 0 && (
            <FAQAccordion faqs={page.faqs} />
          )}

          {/* ── Related comparisons ───────────────────────────────────── */}
          {relatedComparisons.length > 0 && (
            <section aria-label="Otras comparativas">
              <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span aria-hidden="true">🔄</span>
                Otras comparativas
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
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-[#F7A823] flex-shrink-0 transition-colors" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
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
