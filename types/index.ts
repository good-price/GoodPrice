// ── Core product types ────────────────────────────────────────────────────────

export type ProductStatus = 'active' | 'inactive' | 'unverified' | 'stale'

export interface Product {
  id: string
  title: string
  category: string
  image: string
  price: number
  oldPrice?: number
  rating: number
  reviews: number
  badge?: string
  amazonUrl: string
  isTopSeller?: boolean
  isOffer?: boolean
  brand?: string
  description?: string
  // Catalog management fields (optional — ignored by existing UI)
  status?: ProductStatus
  lastValidated?: string        // ISO date string
  shipsToColombiaConfirmed?: boolean
  colombiaRestriction?: string  // reason if restricted
  // Exposed from RawProduct for analytics (populated by hydrate())
  asin?: string
}

// ── Analytics / tracking types ────────────────────────────────────────────────

export type TrackEventType = 'product_click' | 'category_view'

export interface TrackEvent {
  event: TrackEventType
  productId?: string  // for product_click
  asin?: string       // for product_click
  category?: string   // for product_click + category_view
  path: string        // window.location.pathname at event time
  ts: number          // Date.now()
}

export interface ProductClickStats {
  productId: string
  asin: string
  clicks: number
  lastClickAt: string  // ISO
}

export interface CategoryViewStats {
  category: string
  views: number
  lastViewAt: string  // ISO
}

export interface AnalyticsSummary {
  totalEvents: number
  uptimeSince: string                 // ISO — when this server process started
  uniqueProducts: number
  uniqueCategories: number
  topProducts: ProductClickStats[]    // sorted by clicks desc
  topCategories: CategoryViewStats[]  // sorted by views desc
}

export interface Category {
  id: string
  name: string
  slug: string
  icon: string
  count?: number
}

// ── Filter / sort types ───────────────────────────────────────────────────────

export interface FilterState {
  category: string
  minPrice: number
  maxPrice: number
  minRating: number
  brand: string
  isTopSeller: boolean
  isOffer: boolean
  sortBy: SortOption
}

export type SortOption = 'relevance' | 'price-asc' | 'price-desc' | 'rating' | 'reviews'

// ── Catalog management types ──────────────────────────────────────────────────

/** Raw product definition used inside catalog category files.
 *  Catalog index converts this → Product via buildAsinUrl(). */
export interface RawProduct {
  id: string
  asin: string
  title: string
  category: string
  image: string
  price: number
  oldPrice?: number
  rating: number
  reviews: number
  badge?: string
  isTopSeller?: boolean
  isOffer?: boolean
  brand?: string
  description?: string
  status?: ProductStatus
  lastValidated?: string
  shipsToColombiaConfirmed?: boolean
  colombiaRestriction?: string
}

export interface ValidationResult {
  asin: string
  status: ProductStatus
  checkedAt: string
  httpStatus?: number
  reason?: string
}

export interface CatalogStats {
  total: number
  active: number
  inactive: number
  unverified: number
  stale: number
  byCategory: Record<string, number>
  lastUpdated: string
}

export interface ColombiaRule {
  type: 'brand' | 'category' | 'asin' | 'keyword'
  value: string
  restriction: string
  severity: 'block' | 'warn'
}

// ── Programmatic SEO types ────────────────────────────────────────────────────

export type ProgrammaticIntent = 'mejores' | 'top'

/** A single spec row in a product comparison table */
export interface ComparisonRow {
  label: string
  valueA: string
  valueB: string
  /** Which product "wins" this attribute, if applicable */
  winner?: 'A' | 'B' | 'tie'
}

/**
 * "Mejores X" page — editorial "best of" list for a topic.
 * Route: /mejores/[slug]
 */
export interface MejoresPage {
  slug: string
  title: string           // "Los mejores auriculares Bluetooth (2025)"
  seoTitle: string
  seoDescription: string
  keywords: string[]
  intent: ProgrammaticIntent
  /** Short tagline shown in the hero */
  tagline: string
  /** Editorial intro — \n\n for paragraph breaks */
  intro: string
  /** Product IDs from the catalog */
  featuredProductIds: string[]
  relatedGuideSlugs: string[]
  /** /categoria/[slug] internal links */
  relatedCategoryPageSlugs: string[]
  /** /comparar/[slug] cross-links */
  relatedComparisonSlugs: string[]
  faqs: FAQItem[]
  publishedAt: string
  updatedAt: string
  badge?: string
}

/**
 * "A vs B" comparison page.
 * Route: /comparar/[slug]
 */
export interface CompararPage {
  slug: string
  title: string           // "AirPods Pro 2 vs Galaxy Buds2 Pro"
  seoTitle: string
  seoDescription: string
  keywords: string[]
  /** Editorial intro — \n\n for paragraph breaks */
  intro: string
  productAId: string      // catalog product id
  productBId: string
  comparisonRows: ComparisonRow[]
  productAPros: string[]
  productACons: string[]
  productBPros: string[]
  productBCons: string[]
  /** Written verdict / recommendation */
  verdict: string
  verdictWinner: 'A' | 'B' | 'tie'
  faqs: FAQItem[]
  /** Other /comparar/[slug] pages to link to */
  relatedComparisonSlugs: string[]
  publishedAt: string
  updatedAt: string
}

// ── Category landing page types ───────────────────────────────────────────────

export interface FAQItem {
  question: string
  /** Full answer — supports \n\n for paragraph breaks */
  answer: string
}

export interface CategoryStat {
  label: string
  value: string
}

export interface RelatedCategoryRef {
  /** Slug used in /categoria/[slug] route */
  slug: string
  label: string
  icon: string
}

/**
 * Rich editorial content model for /categoria/[slug] SEO landing pages.
 * Separate from the simple `Category` interface used by /categorias/[slug].
 */
export interface CategoryPage {
  // ── Identity ────────────────────────────────────────────────────────────────
  slug: string
  name: string
  icon: string
  badge?: string

  // ── SEO ─────────────────────────────────────────────────────────────────────
  seoTitle: string
  seoDescription: string
  keywords: string[]
  canonicalCategory?: string  // links back to /categorias/[slug] if applicable

  // ── Editorial content ────────────────────────────────────────────────────────
  /** One-sentence tagline shown in the hero */
  tagline: string
  /** 2–3 paragraph intro (\n\n = paragraph break) */
  intro: string

  // ── Catalog references ───────────────────────────────────────────────────────
  /** IDs from the product catalog (id field, not ASIN) */
  featuredProductIds: string[]

  // ── Related content ──────────────────────────────────────────────────────────
  relatedGuideSlugs: string[]
  relatedCategories: RelatedCategoryRef[]

  // ── FAQ ──────────────────────────────────────────────────────────────────────
  faqs: FAQItem[]

  // ── Stats strip ──────────────────────────────────────────────────────────────
  stats: CategoryStat[]

  // ── Discovery ────────────────────────────────────────────────────────────────
  /** Popular search queries for this category shown as clickable chips */
  trendingQueries: string[]
  /** Short curated comparisons or buying scenarios */
  popularComparisons: string[]

  // ── Timestamps ───────────────────────────────────────────────────────────────
  publishedAt: string  // ISO date
  updatedAt: string    // ISO date
}

// ── Content / guide types ─────────────────────────────────────────────────────

export type GuideType = 'buying-guide' | 'comparison' | 'top-list'

export interface GuideSection {
  /** H2 heading for this section */
  heading: string
  /** Body text. Use \n\n to separate paragraphs. */
  body: string
  /** Optional: reference a catalog product by its id field */
  productId?: string
  /** Optional: highlighted callout box (tips, verdicts, warnings) */
  highlight?: string
}

export interface Guide {
  slug: string
  type: GuideType
  /** Full article title (used in H1 and <title>) */
  title: string
  /** Short subtitle shown below the title in the hero */
  headline: string
  /** SEO meta description (under 160 chars) */
  description: string
  /** Opening paragraphs before sections begin (\n\n = paragraph break) */
  intro: string
  /** Primary category slug — links back to that category page */
  category: string
  keywords: string[]
  /** All catalog product IDs referenced in this guide (used for sitemap + structured data) */
  productIds: string[]
  sections: GuideSection[]
  publishedAt: string  // ISO date string
  updatedAt: string    // ISO date string
  /** Optional chip label: "Nuevo", "2025", etc. */
  badge?: string
}
