import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { Star, ChevronLeft } from 'lucide-react'
import { getPublicProducts, getPublicProductByAsin } from '@/lib/catalog/public'
import { buildAsinUrl } from '@/lib/affiliate'
import { buildProductMetadata, SITE_URL } from '@/lib/seo'
import { productSchema, breadcrumbSchema } from '@/lib/seo'
import { categories } from '@/data/categories'
import { getProductPricingUIData } from '@/lib/pricing/ui-data'
import { PriceComparisonPanel } from '@/components/pricing/PriceComparisonPanel'
import { WatchButton } from '@/components/watchlist/WatchButton'
import { getProductImageSrc } from '@/lib/catalog/placeholders'
import { getCachedSnapshot, getSnapshotRelatedProducts } from '@/lib/catalog/intelligence/snapshot'
import { ProductCard } from '@/components/ProductCard'
import { buildCopPriceMap, formatCOP, getCachedRate } from '@/lib/currency'
import { ProductDetailCTA } from '@/components/tracking/ProductDetailCTA'
import { TrackPageView }    from '@/components/TrackPageView'
import { TrackSession }     from '@/components/TrackSession'

// Revalidate every hour — matches the hourly price-check cron job
export const revalidate = 3600

/**
 * Only generate pages for ASINs in the PUBLIC catalog.
 * Inactive / quarantined / low-score products are excluded from static params
 * and return 404 on direct access.
 * dynamicParams = false → any unknown ASIN 404s immediately.
 */
export const dynamicParams = false

interface PageProps {
  params: { asin: string }
}

// ── Static generation — only publicly safe products ────────────────────────────

export function generateStaticParams() {
  return getPublicProducts()
    .filter(p => p.asin)
    .map(p => ({ asin: p.asin! }))
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export function generateMetadata({ params }: PageProps): Metadata {
  const product = getPublicProductByAsin(params.asin)
  if (!product) return { title: 'Producto no encontrado' }
  return buildProductMetadata(product)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function discountPct(price: number, oldPrice: number) {
  return Math.round(((oldPrice - price) / oldPrice) * 100)
}

function formatReviews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}

function categoryLabel(slug: string): string {
  return categories.find(c => c.slug === slug)?.name ?? slug
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ProductoPage({ params }: PageProps) {
  // Use public catalog — returns null for inactive, quarantined, or low-score products
  const product = getPublicProductByAsin(params.asin)
  if (!product) notFound()

  const affiliateUrl = buildAsinUrl(product.asin!)
  const discount = product.oldPrice ? discountPct(product.price, product.oldPrice) : null
  const catLabel = categoryLabel(product.category)
  // Use pre-emptive image fallback (same logic as ProductCard)
  const imageSrc = getProductImageSrc(product.image, product.category)

  // Load pricing data from the store (server-side, graceful degradation on miss)
  // `product.id` is the internal catalog ID (e.g. "elec-001")
  const pricingData = await getProductPricingUIData(product.id ?? '')

  // Related products — powered by intelligence snapshot when available.
  // Gracefully absent on first deploy (before admin generates a snapshot).
  const snapshot        = getCachedSnapshot()
  const relatedProducts = snapshot
    ? getSnapshotRelatedProducts(product, getPublicProducts(), snapshot, 4)
    : []

  // COP pricing — server-side, zero client-side fetches
  const rate           = getCachedRate()
  const productCopPrice = formatCOP(product.price * rate)
  const relatedCopPrices = buildCopPriceMap(relatedProducts)

  // JSON-LD schemas
  const pSchema = productSchema(product)
  const bcSchema = breadcrumbSchema([
    { name: 'Inicio', url: SITE_URL },
    { name: catLabel, url: `${SITE_URL}/categorias/${product.category}` },
    { name: product.title, url: `${SITE_URL}/productos/${product.asin}` },
  ])

  return (
    <>
      {/* ── Analytics tracking ──────────────────────────────────────────── */}
      {/* Server-side: product_view event → /api/track (engagement signal) */}
      <TrackPageView
        event="product_view"
        productId={product.id ?? ''}
        asin={product.asin ?? ''}
        category={product.category}
      />
      {/* Client-side: product_view + category signal → localStorage session */}
      <TrackSession productId={product.id ?? ''} category={product.category} />

      {/* ── Structured data ─────────────────────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(bcSchema) }}
      />

      <div className="max-w-4xl">

        {/* ── Breadcrumb ───────────────────────────────────────────────── */}
        <nav aria-label="Ruta de navegación" className="text-sm text-gray-400 mb-6 flex items-center gap-1.5 flex-wrap">
          <a href="/" className="hover:text-gray-700 transition-colors">Inicio</a>
          <span aria-hidden="true" className="text-gray-300">›</span>
          <a
            href={`/categorias/${product.category}`}
            className="hover:text-gray-700 transition-colors capitalize"
          >
            {catLabel}
          </a>
          <span aria-hidden="true" className="text-gray-300">›</span>
          <span className="text-gray-600 line-clamp-1 max-w-[200px]">{product.title}</span>
        </nav>

        {/* ── Product card ─────────────────────────────────────────────── */}
        <article className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-8">

            {/* Image column */}
            <div className="relative flex-shrink-0 w-full md:w-72 aspect-square bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center">
              <Image
                src={imageSrc}
                alt={product.title}
                fill
                className="object-contain p-4"
                sizes="(max-width: 768px) 100vw, 288px"
                priority
                unoptimized
              />
              {product.badge && (
                <span className="absolute top-3 left-3 bg-[#F7A823] text-black text-xs font-bold px-2.5 py-1 rounded-full">
                  {product.badge}
                </span>
              )}
              {discount && (
                <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  -{discount}%
                </span>
              )}
            </div>

            {/* Details column */}
            <div className="flex flex-col gap-4 flex-1 min-w-0">

              {/* Brand */}
              {product.brand && (
                <span className="text-xs font-semibold text-blue-600 uppercase tracking-widest">
                  {product.brand}
                </span>
              )}

              {/* Title (H1 — primary SEO signal) */}
              <h1 className="text-xl font-bold text-gray-900 leading-snug">
                {product.title}
              </h1>

              {/* Rating */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5" aria-label={`${product.rating} de 5 estrellas`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < Math.floor(product.rating)
                          ? 'fill-[#F7A823] text-[#F7A823]'
                          : i < product.rating
                          ? 'fill-[#F7A823]/50 text-[#F7A823]/50'
                          : 'fill-gray-200 text-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-gray-500">
                  {product.rating} ({formatReviews(product.reviews)} reseñas en Amazon)
                </span>
              </div>

              {/* Price — COP primary, USD reference */}
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl font-bold text-gray-900">
                    {productCopPrice}
                  </span>
                  {discount && (
                    <span className="text-sm font-semibold text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                      {discount}% OFF
                    </span>
                  )}
                </div>
                {/* USD reference + old price */}
                <p className="text-sm text-gray-400">
                  ≈ USD ${product.price.toFixed(2)}
                  {product.oldPrice && (
                    <span className="line-through ml-2">${product.oldPrice.toFixed(2)}</span>
                  )}
                </p>
              </div>

              {/* Local price callout — when ML offer exists */}
              {pricingData?.mlOffer && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">En Colombia:</span>
                  <span className="font-semibold text-gray-800">
                    ${pricingData.mlOffer.priceUSD.toFixed(2)} USD
                  </span>
                  <span className="text-gray-400 text-xs">
                    ($ {Math.round(pricingData.mlOffer.price).toLocaleString('es-CO')} COP)
                  </span>
                </div>
              )}

              {/* CTA — client component: fires trackProductClick() on every click */}
              <ProductDetailCTA
                affiliateUrl={affiliateUrl}
                productId={product.id ?? ''}
                asin={product.asin!}
                category={product.category}
                isOffer={product.isOffer ?? false}
                title={product.title}
              />

              {/* Watch / alert button */}
              <WatchButton
                productId={product.id ?? ''}
                asin={product.asin!}
                title={product.title}
                imageUrl={product.image}
                category={product.category}
                catalogPriceUSD={product.price}
              />

              {/* ASIN reference */}
              <p className="text-[11px] text-gray-300 font-mono">
                ASIN: {product.asin}
              </p>

              {/* Affiliate disclosure */}
              <p className="text-[11px] text-gray-400 leading-relaxed border-t border-gray-50 pt-3">
                Como afiliado de Amazon, GOODPRICE gana comisión por compras calificadas.
                El precio y la disponibilidad pueden variar. Consulta Amazon para el precio final.
              </p>
            </div>
          </div>
        </article>

        {/* ── Price comparison panel ────────────────────────────────────── */}
        {/*
          Renders only when ML offer data exists in the store.
          Gracefully absent on first run (before the price-check job runs).
        */}
        <PriceComparisonPanel
          productId={product.id ?? ''}
          amazonPriceUSD={product.price}
          amazonUrl={affiliateUrl}
          pricingData={pricingData}
        />

        {/* ── Related products ──────────────────────────────────────────── */}
        {relatedProducts.length > 0 && (
          <section className="mt-10" aria-labelledby="related-heading">
            <h2
              id="related-heading"
              className="text-base font-semibold text-gray-700 mb-4"
            >
              Productos relacionados
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {relatedProducts.map(p => (
                <ProductCard
                  key={p.id ?? p.asin}
                  product={p}
                  copPrice={relatedCopPrices[p.id ?? '']}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Back navigation ───────────────────────────────────────────── */}
        <div className="mt-6 flex items-center justify-between">
          <a
            href={`/categorias/${product.category}`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver a {catLabel}
          </a>
          <a
            href="/productos"
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            Ver catálogo completo →
          </a>
        </div>

      </div>
    </>
  )
}
