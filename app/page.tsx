import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { readSiteMode } from '@/lib/system/site-mode'
import { HeroSection }         from '@/components/HeroSection'
import { CategoryGrid }        from '@/components/CategoryGrid'
import { TopSalesSection }     from '@/components/TopSalesSection'
import { OffersSection }       from '@/components/OffersSection'
import { PersonalizedSection } from '@/components/PersonalizedSection'
import { ProductGrid }         from '@/components/ProductGrid'
import { TrustStrip }          from '@/components/trust/TrustStrip'
import { HowItWorks }          from '@/components/trust/HowItWorks'
import { getFeatured }         from '@/data/products'
import { buildCopPriceMap }    from '@/lib/currency'
import { getCachedSnapshot }   from '@/lib/catalog/intelligence/snapshot'
import { buildDynamicBadgeMap } from '@/lib/catalog/badges'
import { buildHomeMetadata, websiteSchema, organizationSchema } from '@/lib/seo'
import { getPublicCatalogStats } from '@/lib/catalog/public'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildHomeMetadata()

export default function HomePage() {
  const { mode } = readSiteMode()
  if (mode === 'development') redirect('/en-desarrollo')

  const stats         = getPublicCatalogStats()
  const featured      = getFeatured(8)
  const copPrices     = buildCopPriceMap(featured)
  const dynamicBadges = buildDynamicBadgeMap(featured, getCachedSnapshot())

  return (
    <>
      {/* JSON-LD: enables sitelinks searchbox + organization knowledge panel */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }}
      />

      <div className="flex flex-col gap-10">

        <HeroSection productCount={stats.public} />

        {/* Credibility signals — productCount es dinámico, no hardcodeado */}
        <TrustStrip productCount={stats.public} />

        <CategoryGrid />

        {/* Sección personalizada — client-only, visible solo en visitas repetidas */}
        <PersonalizedSection />

        {/* Productos con descuento activo */}
        <OffersSection limit={8} />

        {/* Top ventas del catálogo */}
        <TopSalesSection limit={8} />

        {/* Productos destacados — rating ≥ 4.6, ordenados por reseñas */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4">Productos destacados</h2>
          <ProductGrid
            products={featured}
            columns={4}
            priorityCount={4}
            copPrices={copPrices}
            dynamicBadges={dynamicBadges}
          />
        </section>

        {/* Cómo funciona — captura usuarios que scrollearon sin convertir */}
        <HowItWorks />

      </div>
    </>
  )
}
