import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Calendar, Clock, ChevronRight } from 'lucide-react'
import { getGuide, getAllGuideSlugs } from '@/data/guides'
import { getPublicProducts } from '@/lib/catalog/public'
import { categories } from '@/data/categories'
import { ProductCard } from '@/components/ProductCard'
import {
  buildGuideMetadata,
  SITE_URL,
  breadcrumbSchema,
  articleSchema,
  itemListSchema,
} from '@/lib/seo'

interface PageProps {
  params: { slug: string }
}

export const revalidate = 86400

/**
 * Only pre-render pages for slugs that exist in the guide registry.
 * dynamicParams = false ensures unknown slugs → 404.
 */
export const dynamicParams = false

export function generateStaticParams() {
  return getAllGuideSlugs().map(slug => ({ slug }))
}

export function generateMetadata({ params }: PageProps): Metadata {
  const guide = getGuide(params.slug)
  if (!guide) return {}
  return buildGuideMetadata(guide)
}

// ── Label helpers ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  'buying-guide': 'Guía de compra',
  'comparison':   'Comparativa',
  'top-list':     'Top lista',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-xs text-gray-400 mb-6 flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0" />}
          {item.href ? (
            <Link href={item.href} className="hover:text-[#F7A823] transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-600 font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

function Highlight({ text }: { text: string }) {
  return (
    <div className="bg-amber-50 border-l-4 border-[#F7A823] rounded-r-xl px-4 py-3 my-4">
      <p className="text-sm text-amber-900 leading-relaxed">{text}</p>
    </div>
  )
}

function BodyText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/).filter(Boolean)
  return (
    <div className="space-y-4">
      {paragraphs.map((para, i) => (
        <p key={i} className="text-gray-700 leading-relaxed text-[15px]">
          {para}
        </p>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GuiaPage({ params }: PageProps) {
  const guide = getGuide(params.slug)
  if (!guide) notFound()

  const allProducts = getPublicProducts()
  const guideProducts = guide.productIds
    .map(id => allProducts.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)

  const cat = categories.find(c => c.slug === guide.category)
  const guideUrl = `${SITE_URL}/guias/${guide.slug}`

  // JSON-LD: Article or ItemList depending on guide type
  const contentLd =
    guide.type === 'top-list'
      ? itemListSchema(guide, guideProducts)
      : articleSchema(guide)

  const breadcrumbLd = breadcrumbSchema([
    { name: 'Inicio', url: SITE_URL },
    { name: 'Guías', url: `${SITE_URL}/guias` },
    { name: guide.title, url: guideUrl },
  ])

  return (
    <>
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contentLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <article className="max-w-3xl mx-auto">
        {/* Breadcrumb navigation */}
        <Breadcrumb
          items={[
            { label: 'Inicio', href: '/' },
            { label: 'Guías', href: '/guias' },
            { label: guide.title },
          ]}
        />

        {/* Article hero */}
        <header className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 shadow-sm">
          {/* Type + badge chips */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F7A823]/20 text-[#c27b00]">
              {TYPE_LABELS[guide.type] ?? guide.type}
            </span>
            {guide.badge && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                {guide.badge}
              </span>
            )}
            {cat && (
              <Link
                href={`/categorias/${cat.slug}`}
                className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              >
                {cat.icon} {cat.name}
              </Link>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-extrabold text-gray-900 leading-tight mb-2">
            {guide.title}
          </h1>

          {/* Headline */}
          <p className="text-base text-gray-500 mb-4">{guide.headline}</p>

          {/* Meta row */}
          <div className="flex items-center gap-4 text-xs text-gray-400 border-t border-gray-100 pt-4">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Publicado: {formatDate(guide.publishedAt)}
            </span>
            {guide.updatedAt !== guide.publishedAt && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Actualizado: {formatDate(guide.updatedAt)}
              </span>
            )}
            <span className="ml-auto">
              {guideProducts.length} producto{guideProducts.length !== 1 ? 's' : ''} analizados
            </span>
          </div>
        </header>

        {/* Intro */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4 shadow-sm">
          <BodyText text={guide.intro} />
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {guide.sections.map((section, i) => {
            const sectionProduct = section.productId
              ? guideProducts.find(p => p.id === section.productId)
              : null

            return (
              <section
                key={i}
                className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm"
              >
                <h2 className="text-lg font-bold text-gray-800 mb-4 pb-3 border-b border-gray-100">
                  {section.heading}
                </h2>

                <BodyText text={section.body} />

                {/* Highlight box */}
                {section.highlight && (
                  <Highlight text={section.highlight} />
                )}

                {/* Embedded product card */}
                {sectionProduct && (
                  <div className="mt-5 pt-4 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      Producto analizado
                    </p>
                    <div className="max-w-xs">
                      <ProductCard product={sectionProduct} />
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>

        {/* Affiliate disclosure */}
        <div className="mt-6 bg-gray-50 rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 leading-relaxed">
            <strong className="text-gray-500">Divulgación:</strong> GOODPRICE participa en el programa de afiliados
            de Amazon. Si compras a través de los enlaces de esta guía, recibimos una pequeña comisión sin costo
            adicional para ti. Esto no influye en nuestras recomendaciones — solo publicamos productos que
            consideramos genuinamente útiles.
          </p>
        </div>

        {/* Navigation footer */}
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <Link
            href="/guias"
            className="flex-1 text-center py-3 px-4 rounded-xl border border-gray-200 text-sm text-gray-600 hover:border-[#F7A823] hover:text-[#e8961a] transition-colors"
          >
            ← Ver todas las guías
          </Link>
          {cat && (
            <Link
              href={`/categorias/${cat.slug}`}
              className="flex-1 text-center py-3 px-4 rounded-xl bg-[#F7A823] text-sm font-semibold text-black hover:bg-[#e8961a] transition-colors"
            >
              Explorar {cat.name} →
            </Link>
          )}
        </div>
      </article>
    </>
  )
}
