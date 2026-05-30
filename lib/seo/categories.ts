/**
 * SEO utilities for GOODPRICE category landing pages (/categoria/[slug]).
 *
 * Provides:
 *   buildCategoryPageMetadata()  — Next.js Metadata for category landing pages
 *   faqPageSchema()              — FAQPage JSON-LD (Google FAQ rich results)
 *   categoryItemListSchema()     — ItemList JSON-LD listing featured products
 *   categoryCollectionSchema()   — CollectionPage JSON-LD for the category
 */

import type { Metadata } from 'next'
import type { CategoryPage, FAQItem, Product } from '@/types'
import { SITE_URL, SITE_NAME, truncateSEO } from './meta'
import { buildAsinUrl } from '@/lib/affiliate'

// ── Metadata ──────────────────────────────────────────────────────────────────

export function buildCategoryPageMetadata(page: CategoryPage): Metadata {
  const url = `${SITE_URL}/categoria/${page.slug}`
  const title = truncateSEO(page.seoTitle, 70)
  const description = page.seoDescription

  return {
    title,
    description,
    keywords: page.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'es_CO',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

// ── JSON-LD schemas ───────────────────────────────────────────────────────────

/**
 * FAQPage schema — enables Google to display Q&A directly in search results.
 * Each FAQ item becomes an expandable accordion in the SERP.
 *
 * Requirements per Google's guidelines:
 *   - At least 1 FAQ item
 *   - Questions and answers must be visible on the page
 *   - No duplicated FAQs across pages
 */
export function faqPageSchema(faqs: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        // Strip \n\n paragraph breaks for schema — plain text only
        text: faq.answer.replace(/\n\n+/g, ' ').trim(),
      },
    })),
  }
}

/**
 * ItemList schema — lists the featured products for this category.
 * Helps Google understand which products are prominently featured.
 */
export function categoryItemListSchema(page: CategoryPage, products: Product[]) {
  const url = `${SITE_URL}/categoria/${page.slug}`

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${page.name} — productos destacados en Amazon`,
    description: page.seoDescription,
    url,
    inLanguage: 'es-CO',
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.title,
      url: buildAsinUrl(p.asin ?? ''),
      image: p.image,
      description: p.description ?? p.title,
    })),
  }
}

/**
 * CollectionPage schema — establishes this page as a curated collection.
 * Paired with BreadcrumbList for full navigation context.
 */
export function categoryCollectionSchema(page: CategoryPage) {
  const url = `${SITE_URL}/categoria/${page.slug}`

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page.seoTitle,
    description: page.seoDescription,
    url,
    inLanguage: 'es-CO',
    keywords: page.keywords.join(', '),
    datePublished: page.publishedAt,
    dateModified: page.updatedAt,
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
    },
    about: {
      '@type': 'Thing',
      name: page.name,
    },
  }
}
