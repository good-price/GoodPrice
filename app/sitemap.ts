import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'
import { getPublicProducts } from '@/lib/catalog/public'
import { categories } from '@/data/categories'
import { GUIDES } from '@/data/guides'
import { CATEGORY_PAGES } from '@/data/category-pages'
import { MEJORES_PAGES } from '@/data/programmatic/mejores'
import { COMPARAR_PAGES } from '@/data/programmatic/comparar'

/**
 * Dynamic sitemap — served at /sitemap.xml.
 * Next.js 14 generates this automatically from this file.
 *
 * Priority strategy:
 *   1.0  Home                    → most important, crawled daily
 *   0.9  /productos, /ofertas    → main catalog entry points
 *   0.8  /top-ventas             → high-value commercial page
 *   0.85 /categoria/[slug]       → editorial category landing pages (SEO priority)
 *   0.8  /mejores/[slug]         → programmatic "best of" pages (high-intent)
 *   0.8  /guias/[slug]           → guide articles (high-intent content)
 *   0.75 /comparar/[slug]        → product comparison pages (high-intent commercial)
 *   0.7  /categorias/[slug]      → category listing pages (long-tail)
 *   0.6  /productos/[asin]       → individual product pages (long-tail)
 *   0.5  /categorias, /guias     → index pages, less SEO value than slugs
 *
 * lastModified uses product.lastValidated when available,
 * falling back to build time for static routes.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Only publicly safe products — ensures sitemap has no 404 URLs
  const products = getPublicProducts()
  const now = new Date()

  // ── Static routes ────────────────────────────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/productos`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/ofertas`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/top-ventas`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/categorias`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/guias`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ]

  // ── Category pages ────────────────────────────────────────────────────────────
  const categoryRoutes: MetadataRoute.Sitemap = categories.map(cat => ({
    url: `${SITE_URL}/categorias/${cat.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  // ── Product pages ─────────────────────────────────────────────────────────────
  const productRoutes: MetadataRoute.Sitemap = products
    .filter(p => p.asin)  // only products with valid ASIN
    .map(p => ({
      url: `${SITE_URL}/productos/${p.asin}`,
      // Use lastValidated if available — reflects freshness of product data
      lastModified: p.lastValidated ? new Date(p.lastValidated) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))

  // ── Guide pages ───────────────────────────────────────────────────────────────
  // Priority 0.8 — high-intent content pages rank above category indexes
  const guideRoutes: MetadataRoute.Sitemap = GUIDES.map(guide => ({
    url: `${SITE_URL}/guias/${guide.slug}`,
    lastModified: new Date(guide.updatedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  // ── Category landing pages ────────────────────────────────────────────────────
  // Priority 0.85 — editorial SEO pages with FAQ rich results, high-intent queries
  const categoryLandingRoutes: MetadataRoute.Sitemap = CATEGORY_PAGES.map(cat => ({
    url: `${SITE_URL}/categoria/${cat.slug}`,
    lastModified: new Date(cat.updatedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.85,
  }))

  // ── Mejores pages ─────────────────────────────────────────────────────────────
  // Priority 0.8 — high-intent "best of" affiliate pages, programmatically generated
  const mejoresRoutes: MetadataRoute.Sitemap = MEJORES_PAGES.map(p => ({
    url: `${SITE_URL}/mejores/${p.slug}`,
    lastModified: new Date(p.updatedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  // ── Comparar pages ────────────────────────────────────────────────────────────
  // Priority 0.75 — high-intent commercial comparison pages
  const compararRoutes: MetadataRoute.Sitemap = COMPARAR_PAGES.map(p => ({
    url: `${SITE_URL}/comparar/${p.slug}`,
    lastModified: new Date(p.updatedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.75,
  }))

  return [
    ...staticRoutes,
    ...categoryRoutes,
    ...productRoutes,
    ...guideRoutes,
    ...categoryLandingRoutes,
    ...mejoresRoutes,
    ...compararRoutes,
  ]
}
