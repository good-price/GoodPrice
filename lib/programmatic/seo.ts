/**
 * SEO utilities for GOODPRICE programmatic pages.
 *
 * /mejores/[slug] — "best of" editorial pages
 * /comparar/[slug] — product vs product comparison pages
 *
 * JSON-LD strategy per page type:
 *   mejores → Article + ItemList + FAQPage + BreadcrumbList
 *   comparar → Article + Product (×2) + FAQPage + BreadcrumbList
 */

import type { Metadata } from 'next'
import type { MejoresPage, CompararPage, Product, FAQItem } from '@/types'
import { SITE_URL, SITE_NAME, truncateSEO } from '@/lib/seo/meta'
import { buildAsinUrl } from '@/lib/affiliate'

// ── /mejores/[slug] metadata ──────────────────────────────────────────────────

export function buildMejoresMetadata(page: MejoresPage): Metadata {
  const url = `${SITE_URL}/mejores/${page.slug}`
  const title = truncateSEO(page.seoTitle, 70)

  return {
    title,
    description: page.seoDescription,
    keywords: page.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: page.seoDescription,
      url,
      siteName: SITE_NAME,
      locale: 'es_CO',
      type: 'article',
      publishedTime: page.publishedAt,
      modifiedTime: page.updatedAt,
    },
    twitter: { card: 'summary_large_image', title, description: page.seoDescription },
  }
}

// ── /comparar/[slug] metadata ─────────────────────────────────────────────────

export function buildCompararMetadata(page: CompararPage): Metadata {
  const url = `${SITE_URL}/comparar/${page.slug}`
  const title = truncateSEO(page.seoTitle, 70)

  return {
    title,
    description: page.seoDescription,
    keywords: page.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: page.seoDescription,
      url,
      siteName: SITE_NAME,
      locale: 'es_CO',
      type: 'article',
      publishedTime: page.publishedAt,
      modifiedTime: page.updatedAt,
    },
    twitter: { card: 'summary_large_image', title, description: page.seoDescription },
  }
}

// ── JSON-LD schemas ───────────────────────────────────────────────────────────

/** Article schema for editorial "best of" pages */
export function mejoresArticleSchema(page: MejoresPage) {
  const url = `${SITE_URL}/mejores/${page.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.title,
    description: page.seoDescription,
    url,
    inLanguage: 'es-CO',
    datePublished: page.publishedAt,
    dateModified: page.updatedAt,
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    keywords: page.keywords.join(', '),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

/** ItemList schema listing featured products for a mejores page */
export function mejoresItemListSchema(page: MejoresPage, products: Product[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: page.title,
    description: page.seoDescription,
    url: `${SITE_URL}/mejores/${page.slug}`,
    inLanguage: 'es-CO',
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.title,
      url: buildAsinUrl(p.asin ?? ''),
      image: p.image,
    })),
  }
}

/** Article schema for comparison pages */
export function compararArticleSchema(page: CompararPage) {
  const url = `${SITE_URL}/comparar/${page.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.title,
    description: page.seoDescription,
    url,
    inLanguage: 'es-CO',
    datePublished: page.publishedAt,
    dateModified: page.updatedAt,
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    keywords: page.keywords.join(', '),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

/** Product schema pair for comparison pages */
export function compararProductSchemas(productA: Product, productB: Product) {
  const makeSchema = (p: Product) => ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    image: [p.image],
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    offers: {
      '@type': 'Offer',
      price: p.price.toFixed(2),
      priceCurrency: 'USD',
      url: buildAsinUrl(p.asin ?? ''),
      availability: 'https://schema.org/InStock',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: p.rating.toFixed(1),
      reviewCount: p.reviews,
      bestRating: '5',
      worstRating: '1',
    },
  })
  return [makeSchema(productA), makeSchema(productB)]
}

/** FAQPage schema — reusable across page types */
export function programmaticFaqSchema(faqs: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer.replace(/\n\n+/g, ' ').trim(),
      },
    })),
  }
}
