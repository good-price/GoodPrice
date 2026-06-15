import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { readSiteMode } from '@/lib/system/site-mode'
import { categories } from '@/data/categories'
import { getPublicCategoryProducts } from '@/lib/catalog/public'
import { ProductsClient } from '@/components/ProductsClient'
import { TrackPageView } from '@/components/TrackPageView'
import { TrackSession }  from '@/components/TrackSession'
import { buildCopPriceMap } from '@/lib/currency'
import { getCachedSnapshot } from '@/lib/catalog/intelligence/snapshot'
import { buildDynamicBadgeMap } from '@/lib/catalog/badges'
import { buildCategoryMetadata, SITE_URL, collectionPageSchema, breadcrumbSchema } from '@/lib/seo'

interface PageProps {
  params: { slug: string }
}

export const dynamic = 'force-dynamic'

export function generateStaticParams() {
  return categories.map(cat => ({ slug: cat.slug }))
}

export function generateMetadata({ params }: PageProps): Metadata {
  const cat = categories.find(c => c.slug === params.slug)
  if (!cat) return {}
  const count = getPublicCategoryProducts(params.slug).length
  return buildCategoryMetadata(cat, count)
}

export default function CategoryPage({ params }: PageProps) {
  const { mode } = readSiteMode()
  if (mode === 'development') redirect('/en-desarrollo')

  const cat = categories.find(c => c.slug === params.slug)
  if (!cat) notFound()

  const categoryProducts = getPublicCategoryProducts(params.slug)
  const copPrices        = buildCopPriceMap(categoryProducts)
  const dynamicBadges    = buildDynamicBadgeMap(categoryProducts, getCachedSnapshot())
  const catUrl = `${SITE_URL}/categorias/${params.slug}`

  const collectionLd = collectionPageSchema(
    `${cat.name} en Amazon — GOODPRICE`,
    `${categoryProducts.length} productos de ${cat.name} curados para Colombia.`,
    catUrl
  )

  const breadcrumbLd = breadcrumbSchema([
    { name: 'Inicio', url: SITE_URL },
    { name: 'Categorías', url: `${SITE_URL}/categorias` },
    { name: cat.name, url: catUrl },
  ])

  return (
    <>
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div>
        {/* Server analytics tracking */}
        <TrackPageView event="category_view" category={params.slug} />
        {/* Session profile tracking (localStorage — for personalisation) */}
        <TrackSession category={params.slug} />

        {/* Category header */}
        <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm">
          <span className="text-4xl" aria-hidden="true">{cat.icon}</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{cat.name}</h1>
            <p className="text-sm text-gray-400">
              {categoryProducts.length} producto{categoryProducts.length !== 1 ? 's' : ''} disponibles
            </p>
          </div>
        </div>

        {categoryProducts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-lg font-medium">Próximamente</p>
            <p className="text-sm mt-1">Estamos agregando productos a esta categoría</p>
          </div>
        ) : (
          <ProductsClient products={categoryProducts} copPrices={copPrices} dynamicBadges={dynamicBadges} />
        )}
      </div>
    </>
  )
}
