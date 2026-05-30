import { Metadata } from 'next'
import { HeroSection }         from '@/components/HeroSection'
import { CategoryGrid }        from '@/components/CategoryGrid'
import { TopSalesSection }     from '@/components/TopSalesSection'
import { OffersSection }       from '@/components/OffersSection'
import { TrendingSection }     from '@/components/TrendingSection'
import { BestImportsSection }  from '@/components/BestImportsSection'
import { PersonalizedSection } from '@/components/PersonalizedSection'
import { ProductGrid }         from '@/components/ProductGrid'
import { TrustStrip }          from '@/components/trust/TrustStrip'
import { HowItWorks }          from '@/components/trust/HowItWorks'
import { getFeatured }         from '@/data/products'
import { buildCopPriceMap }    from '@/lib/currency'
import { getCachedSnapshot }   from '@/lib/catalog/intelligence/snapshot'
import { buildDynamicBadgeMap } from '@/lib/catalog/badges'
import { buildHomeMetadata, websiteSchema, organizationSchema } from '@/lib/seo'

export const revalidate = 86400

export const metadata: Metadata = buildHomeMetadata()

export default function HomePage() {
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
        <HeroSection />

        {/* Credibility signals — right below the fold */}
        <TrustStrip />

        <CategoryGrid />

        {/* Personalised section — client-only, appears after hydration on return visits */}
        <PersonalizedSection />

        {/* Daily deals */}
        <OffersSection limit={8} />

        {/* Intelligence-promoted trending products (hidden until snapshot exists) */}
        <TrendingSection limit={8} />

        {/* Top sellers ranked by intelligence engine */}
        <TopSalesSection limit={8} />

        {/* Confirmed Colombia-shippable picks (hidden until Colombia audit runs) */}
        <BestImportsSection limit={8} />

        {/* Featured products — priorityCount=4 preloads the first row (LCP) */}
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

        {/* How it works — captures scrollers who haven't converted yet */}
        <HowItWorks />
      </div>
    </>
  )
}
