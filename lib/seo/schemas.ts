/**
 * JSON-LD structured data schemas for GOODPRICE.
 *
 * Structured data helps Google understand page content and enables
 * rich results: star ratings, prices, breadcrumbs in search snippets.
 *
 * Usage in Server Components:
 *   <script
 *     type="application/ld+json"
 *     dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema(p)) }}
 *   />
 *
 * dangerouslySetInnerHTML is safe here because:
 *   - Data comes from our own catalog (not user input)
 *   - JSON.stringify escapes all special characters
 *   - This runs server-side only (no XSS vector)
 */

import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from './meta'
import { buildAsinUrl } from '@/lib/affiliate'
import type { Product } from '@/types'

// ── Site-level schemas ────────────────────────────────────────────────────────

/**
 * WebSite schema — enables sitelinks searchbox in Google.
 * Include once on the home page.
 */
export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: 'es-CO',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/productos?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

/**
 * Organization schema — establishes brand identity.
 * Include on the home page alongside websiteSchema.
 */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    // Update logo URL once you have a hosted image
    // logo: `${SITE_URL}/logo.png`,
  }
}

// ── Product-level schemas ─────────────────────────────────────────────────────

/**
 * Product schema — enables rich results with star ratings, price, availability.
 * Include on /productos/[asin] pages.
 *
 * Google requires: name, image, offers (with price + currency + availability).
 * aggregateRating enables star ratings in search snippets.
 */
export function productSchema(product: Product) {
  const affiliateUrl = buildAsinUrl(product.asin ?? '')

  // priceValidUntil: 7 days from now (conservative — forces Google to re-check)
  const priceValidUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    image: [product.image],
    url: `${SITE_URL}/productos/${product.asin}`,
    offers: {
      '@type': 'Offer',
      price: product.price.toFixed(2),
      priceCurrency: 'USD',
      url: affiliateUrl,
      availability: 'https://schema.org/InStock',
      priceValidUntil,
      seller: {
        '@type': 'Organization',
        name: 'Amazon',
        url: 'https://www.amazon.com',
      },
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: product.rating.toFixed(1),
      reviewCount: product.reviews,
      bestRating: '5',
      worstRating: '1',
    },
  }

  if (product.brand) {
    schema.brand = { '@type': 'Brand', name: product.brand }
  }

  if (product.description) {
    schema.description = product.description
  }

  return schema
}

// ── Navigation schemas ────────────────────────────────────────────────────────

export interface BreadcrumbItem {
  name: string
  url: string
}

/**
 * BreadcrumbList schema — shows navigation path in search result snippets.
 * Include on category and product pages.
 */
export function breadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

// ── Collection schemas ────────────────────────────────────────────────────────

/**
 * CollectionPage schema — clarifies that this page lists a curated set of products.
 * Use on /categorias/[slug] pages.
 */
export function collectionPageSchema(name: string, description: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url,
    inLanguage: 'es-CO',
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
    },
  }
}
