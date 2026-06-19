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
  discoveredAt: string         // ISO 8601
  source:       'best-sellers'
  brand?:       string | null  // Sprint 4B: enriched from title; optional for backward compat

  // Sprint 4C: Intelligence tracking (optional — backward compatible with existing store entries)
  firstDiscoveredAt?:       string
  lastDiscoveredAt?:        string
  timesDiscovered?:         number
  timesValidated?:          number
  timesRejected?:           number
  timesAdmitted?:           number
  qualityScore?:            number
  confidenceScore?:         number
  lastDiscoveryPipelineId?: string
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

// ── Sprint 3F: Catalog Pipeline Candidate ─────────────────────────────────────

export type CatalogCandidateSource = 'amazon-page' | 'paapi' | 'manual'

export interface CatalogCandidate {
  asin:                     string
  title:                    string
  image:                    string | null
  brand:                    string
  category:                 string
  price:                    number
  rating:                   number
  reviews:                  number
  shipsToColombiaConfirmed: boolean
  source:                   CatalogCandidateSource
  discoveryScore:           number   // 0–100, set by rankCatalogCandidates()
  validationScore:          number   // 0–100, set by validateCatalogCandidates()
  reasons:                  string[] // human-readable scoring notes

  // Sprint 4C: Intelligence (optional — populated from DiscoveryCandidate when available)
  firstDiscoveredAt?:       string
  lastDiscoveredAt?:        string
  timesDiscovered?:         number
  timesValidated?:          number
  timesRejected?:           number
  timesAdmitted?:           number
  confidenceScore?:         number
  qualityScore?:            number
  lastDiscoveryPipelineId?: string
}

export interface DiscoveryContext {
  /** Target category slug being filled. */
  category:   string
  /** How many products are needed. */
  deficit:    number
  /** OPS pipeline ID for traceability. */
  pipelineId: string
}

export interface DiscoveryResult {
  status:      'completed' | 'already_running' | 'no_deficit' | 'error'
  category?:   string
  deficit?:    number
  found?:      number
  validated?:  number
  /** Products prepared for admission (Sprint 3F) / actually admitted (Sprint 3G). */
  prepared?:   number
  admitted?:   number
  pipelineId?: string
}
