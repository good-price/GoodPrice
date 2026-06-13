/**
 * SEO utilities for GOODPRICE MDX editorial content.
 *
 * Covers:
 *   /reviews/[slug]    — Review + Article + FAQ + BreadcrumbList schemas
 *   /comparisons MDX   — Article + ItemList schemas (editorial layer)
 *   /guides MDX        — Article + ItemList schemas (editorial layer)
 */

import type { Metadata } from 'next'
import type {
  ReviewFrontmatter,
  ComparisonFrontmatter,
  GuideFrontmatter,
} from '@/types/editorial'
import type { Product, FAQItem } from '@/types'
import { SITE_URL, SITE_NAME, truncateSEO } from './meta'
import { buildAsinUrl } from '@/lib/affiliate'

// ── Review metadata ───────────────────────────────────────────────────────────

export function buildReviewMetadata(
  review: ReviewFrontmatter,
  slug: string,
): Metadata {
  const url = `${SITE_URL}/reviews/${slug}`
  const title = truncateSEO(review.seoTitle, 70)

  return {
    title,
    description: review.seoDescription,
    keywords: review.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: review.seoDescription,
      url,
      siteName: SITE_NAME,
      locale: 'es_CO',
      type: 'article',
      publishedTime: review.publishDate,
      modifiedTime: review.updatedDate,
      ...(review.featuredImage ? { images: [{ url: review.featuredImage }] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description: review.seoDescription },
  }
}

export function buildReviewsIndexMetadata(): Metadata {
  const title = 'Reviews de productos tecnológicos para Colombia'
  const description =
    'Análisis completos de productos tech disponibles en Amazon Colombia. ' +
    'Pros, contras, precio real y veredicto honesto.'
  const url = `${SITE_URL}/reviews`

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

// ── Review JSON-LD schemas ────────────────────────────────────────────────────

/**
 * Review schema — enables Google rich results with star ratings on /reviews/[slug].
 * References the reviewed Product with its Amazon offer.
 */
export function reviewSchema(
  review: ReviewFrontmatter,
  product: Product,
  slug: string,
) {
  const url = `${SITE_URL}/reviews/${slug}`

  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    headline: review.title,
    description: review.seoDescription,
    url,
    inLanguage: 'es-CO',
    datePublished: review.publishDate,
    dateModified: review.updatedDate,
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: review.rating,
      bestRating: 10,
      worstRating: 1,
    },
    reviewBody: review.verdict,
    itemReviewed: {
      '@type': 'Product',
      name: product.title,
      image: [product.image],
      sku: product.asin,
      ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
      offers: {
        '@type': 'Offer',
        price: product.price.toFixed(2),
        priceCurrency: 'USD',
        url: buildAsinUrl(product.asin ?? ''),
        availability: 'https://schema.org/InStock',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.rating.toFixed(1),
        reviewCount: product.reviews,
        bestRating: '5',
        worstRating: '1',
      },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

/**
 * Article schema for reviews — complements the Review schema.
 * Google uses both: Review for rating rich results, Article for date/byline.
 */
export function reviewArticleSchema(review: ReviewFrontmatter, slug: string) {
  const url = `${SITE_URL}/reviews/${slug}`

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    articleSection: 'Review',
    headline: review.title,
    description: review.seoDescription,
    url,
    inLanguage: 'es-CO',
    datePublished: review.publishDate,
    dateModified: review.updatedDate,
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    keywords: review.keywords.join(', '),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  }
}

// ── Editorial comparison JSON-LD ──────────────────────────────────────────────

export function editorialComparisonSchema(
  comparison: ComparisonFrontmatter,
  leftProduct: Product,
  rightProduct: Product,
  slug: string,
) {
  const url = `${SITE_URL}/comparar/${slug}`

  return {
    '@context': 'https://schema.org',
    '@type': ['Article', 'ItemList'],
    headline: comparison.title,
    description: comparison.seoDescription,
    url,
    inLanguage: 'es-CO',
    datePublished: comparison.publishDate,
    dateModified: comparison.updatedDate,
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    keywords: comparison.keywords.join(', '),
    numberOfItems: 2,
    itemListElement: [leftProduct, rightProduct].map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.title,
        sku: p.asin,
        image: [p.image],
        offers: {
          '@type': 'Offer',
          price: p.price.toFixed(2),
          priceCurrency: 'USD',
          url: buildAsinUrl(p.asin ?? ''),
        },
      },
    })),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

// ── Editorial guide JSON-LD ───────────────────────────────────────────────────

export function editorialGuideSchema(
  guide: GuideFrontmatter,
  products: Product[],
  slug: string,
) {
  const url = `${SITE_URL}/guias/${slug}`

  return {
    '@context': 'https://schema.org',
    '@type': ['Article', 'ItemList'],
    articleSection: 'Guía de compra',
    headline: guide.title,
    description: guide.seoDescription,
    url,
    inLanguage: 'es-CO',
    datePublished: guide.publishDate,
    dateModified: guide.updatedDate,
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    keywords: guide.keywords.join(', '),
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.title,
      url: buildAsinUrl(p.asin ?? ''),
      image: p.image,
    })),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

// ── Shared: FAQ schema ────────────────────────────────────────────────────────

/**
 * FAQPage schema for editorial content.
 * Returns null when faqs array is empty (safe to skip the <script> tag).
 */
export function editorialFaqSchema(faqs: FAQItem[]): object | null {
  if (!faqs.length) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer.replace(/\n\n+/g, ' ').trim(),
      },
    })),
  }
}
