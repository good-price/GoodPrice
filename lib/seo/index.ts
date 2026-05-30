/**
 * Public API for GOODPRICE SEO utilities.
 * Import from here — not from individual lib/seo/* files.
 */

// ── Constants ─────────────────────────────────────────────────────────────────
export { SITE_URL, SITE_NAME, SITE_DESCRIPTION, truncateSEO } from './meta'

// ── Metadata builders ─────────────────────────────────────────────────────────
export {
  baseMetadata,
  buildHomeMetadata,
  buildCatalogMetadata,
  buildOffersMetadata,
  buildTopSellersMetadata,
  buildCategoriesIndexMetadata,
  buildCategoryMetadata,
  buildProductMetadata,
} from './meta'

// ── JSON-LD schema builders ───────────────────────────────────────────────────
export {
  websiteSchema,
  organizationSchema,
  productSchema,
  breadcrumbSchema,
  collectionPageSchema,
} from './schemas'

export type { BreadcrumbItem } from './schemas'

// ── Guide SEO ─────────────────────────────────────────────────────────────────
export {
  buildGuideMetadata,
  buildGuidesIndexMetadata,
  articleSchema,
  itemListSchema,
} from './guides'

// ── Category landing page SEO ─────────────────────────────────────────────────
export {
  buildCategoryPageMetadata,
  faqPageSchema,
  categoryItemListSchema,
  categoryCollectionSchema,
} from './categories'
