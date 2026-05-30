/**
 * SEO utilities for GOODPRICE guide pages (/guias/[slug]).
 *
 * Provides:
 *   - buildGuideMetadata() — Next.js Metadata for article pages
 *   - articleSchema()      — Article JSON-LD for buying guides / comparisons
 *   - itemListSchema()     — ItemList JSON-LD for top-list guides
 */

import type { Metadata } from 'next'
import type { Guide, Product } from '@/types'
import { SITE_URL, SITE_NAME, truncateSEO } from './meta'
import { buildAsinUrl } from '@/lib/affiliate'

// ── Metadata ──────────────────────────────────────────────────────────────────

/**
 * Builds Next.js Metadata for a guide article page.
 * Includes canonical URL, Open Graph article type, and keywords.
 */
export function buildGuideMetadata(guide: Guide): Metadata {
  const url = `${SITE_URL}/guias/${guide.slug}`
  const title = truncateSEO(guide.title, 65)
  const description = guide.description

  return {
    title,
    description,
    keywords: guide.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'es_CO',
      type: 'article',
      publishedTime: guide.publishedAt,
      modifiedTime: guide.updatedAt,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

/**
 * Builds the /guias hub-page metadata.
 */
export function buildGuidesIndexMetadata(): Metadata {
  const title = 'Guías de compra de Amazon para Colombia'
  const description =
    'Guías detalladas, comparativas y listas de los mejores productos de Amazon para Colombia. ' +
    'Análisis honesto, precios reales, sin spam.'
  const url = `${SITE_URL}/guias`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'es_CO',
      type: 'website',
    },
    twitter: { card: 'summary', title, description },
  }
}

// ── JSON-LD schemas ───────────────────────────────────────────────────────────

/**
 * Article schema — for 'buying-guide' and 'comparison' guide types.
 * Enables Google to show article rich results with date and publisher info.
 */
export function articleSchema(guide: Guide) {
  const url = `${SITE_URL}/guias/${guide.slug}`

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.description,
    url,
    inLanguage: 'es-CO',
    datePublished: guide.publishedAt,
    dateModified: guide.updatedAt,
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    keywords: guide.keywords.join(', '),
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
    },
  }
}

/**
 * ItemList schema — for 'top-list' guide types.
 * Enables Google to display list items directly in search results.
 *
 * Each list item links to the Amazon product via the affiliate URL.
 */
export function itemListSchema(guide: Guide, products: Product[]) {
  const url = `${SITE_URL}/guias/${guide.slug}`

  const items = products.map((product, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: product.title,
    url: buildAsinUrl(product.asin ?? ''),
    description: product.description ?? product.title,
    image: product.image,
  }))

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: guide.title,
    description: guide.description,
    url,
    inLanguage: 'es-CO',
    numberOfItems: items.length,
    itemListElement: items,
  }
}
