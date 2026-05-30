import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

/**
 * robots.txt — served at /robots.txt.
 *
 * Strategy:
 *   - Allow all public catalog pages (/, /productos, /categorias, /ofertas, /top-ventas)
 *   - Block /admin (internal monitoring — no indexing value)
 *   - Block /api/ (server endpoints — not pages)
 *   - Declare sitemap location for all crawlers
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',       // internal admin panel
          '/api/',        // server API routes
          '/productos?',  // search result URLs (no canonical)
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
