/**
 * Registry for GOODPRICE category SEO landing pages.
 *
 * These are editorial /categoria/[slug] pages — distinct from the
 * simple product grids at /categorias/[slug].
 *
 * How to add a new category page:
 *   1. Create data/category-pages/my-slug.ts following the CategoryPage interface
 *   2. Import it here and add to CATEGORY_PAGES
 *   3. sitemap.ts and search index pick it up automatically
 *
 * Product IDs in featuredProductIds must match ids in the catalog
 * (data/catalog/*.ts). Unknown IDs are silently filtered at render time.
 */

import type { CategoryPage } from '@/types'

import auriculares from './auriculares'
import homeOffice   from './home-office'
import gaming       from './gaming'
import laptops      from './laptops'

// ── Registry ──────────────────────────────────────────────────────────────────
// Display order on any hub/index page

export const CATEGORY_PAGES: CategoryPage[] = [
  auriculares,
  homeOffice,
  gaming,
  laptops,
]

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getCategoryPage(slug: string): CategoryPage | undefined {
  return CATEGORY_PAGES.find(c => c.slug === slug)
}

export function getAllCategoryPageSlugs(): string[] {
  return CATEGORY_PAGES.map(c => c.slug)
}

export function getCategoryPagesByCanonical(categorySlug: string): CategoryPage[] {
  return CATEGORY_PAGES.filter(c => c.canonicalCategory === categorySlug)
}
