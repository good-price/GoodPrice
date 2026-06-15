/**
 * lib/catalog/discovery/types.ts
 *
 * Types for the Best Sellers Discovery Engine.
 * Discovery produces candidates that can be fed to validateCandidate() separately.
 */

// ── Tile data extracted from Best Sellers pages ────────────────────────────────

export interface BestSellerTile {
  /** Amazon ASIN. */
  asin:        string
  /** Position on the Best Sellers page (1-indexed). */
  rank:        number
  /** GOODPRICE category slug (e.g. "electronica", "gaming"). */
  category:    string
  tileTitle:   string | null
  imageUrl:    string | null
  rating:      number | null
  reviewCount: number | null
  tilePrice:   number | null
}

// ── Candidate (tile that passed pre-filter) ────────────────────────────────────

export interface DiscoveryCandidate extends BestSellerTile {
  discoveredAt: string   // ISO 8601
  source:       'best-sellers'
}

// ── Per-category scrape result ─────────────────────────────────────────────────

export interface CategoryScrapeResult {
  category:  string
  url:       string
  extracted: number   // total tiles found on page
  filtered:  number   // tiles that did NOT pass pre-filter
  passed:    number   // tiles that passed pre-filter
  blocked:   boolean
  error?:    string
}

// ── Category report (returned in the API response) ────────────────────────────

export interface CategoryReport {
  category:  string
  extracted: number
  filtered:  number
  passed:    number
}

// ── Overall run result ────────────────────────────────────────────────────────

export interface DiscoveryRunResult {
  /** Total ASINs extracted across all categories (before pre-filter). */
  discovered:  number
  /** ASINs that did NOT pass pre-filter (across all categories). */
  filtered:    number
  /** Unique ASINs saved to the candidate store after pre-filter + dedup. */
  candidates:  number
  byCategory:  CategoryReport[]
  runAt:       string
}

// ── Candidate store (persisted JSON) ──────────────────────────────────────────

export interface CandidateStore {
  updatedAt: string
  items:     DiscoveryCandidate[]
}
