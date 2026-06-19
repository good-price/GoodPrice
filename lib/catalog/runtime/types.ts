/**
 * lib/catalog/runtime/types.ts
 *
 * Type definitions for the Runtime Catalog — the mutable JSON source of truth
 * for all public-facing catalog data in GOODPRICE OPS V3.
 *
 * Persisted to:
 *   data/catalog/runtime-catalog.json        — active store
 *   data/catalog/runtime-catalog.backup.json — previous state, auto-rotated
 *   data/catalog/category-config.json        — per-category minimums
 *
 * SERVER-ONLY.
 */

// ── Product ───────────────────────────────────────────────────────────────────

export type RuntimeProductStatus =
  | 'active'
  | 'inactive'
  | 'unverified'
  | 'stale'

export type RuntimeProductSource =
  | 'legacy'
  | 'auto-fill'
  | 'manual'
  | 'repair'

export interface RuntimeProduct {
  // ── Identity ────────────────────────────────────────────────────────────────
  id:    string   // "elec-001"
  asin:  string   // "B00SFSU53G" — 10-char A-Z0-9
  category: string // slug: "electronica"

  // ── Public data ─────────────────────────────────────────────────────────────
  title:        string
  amazonTitle:  string
  brand:        string
  image:        string  // CDN image URL

  price:   number  // USD
  rating:  number  // 0.0–5.0
  reviews: number  // integer

  // ── Status ──────────────────────────────────────────────────────────────────
  status: RuntimeProductStatus

  shipsToColombiaConfirmed: boolean

  // ── Origin & audit trail ────────────────────────────────────────────────────
  source:       RuntimeProductSource
  admittedAt:   string        // ISO — when added to the runtime catalog
  lastValidated: string | null // ISO — last live-truth check

  // ── Scoring ─────────────────────────────────────────────────────────────────
  trustScore?:      number   // 0–100 from trust-recompute
  validationScore?: number   // 0–100 from daily-audit

  // ── Sync timestamps ─────────────────────────────────────────────────────────
  lastPriceSync?: string | null  // ISO — last PAAPI price sync
  lastImageSync?: string | null  // ISO — last image CDN sync

  // ── Editorial flags (preserved from legacy catalog, optional) ────────────────
  isTopSeller?: boolean
  isOffer?:     boolean
  badge?:       string
  oldPrice?:    number
  shortTitle?:  string
  description?: string

  // ── Pipeline trace ──────────────────────────────────────────────────────────
  addedByPipelineId?:       string  // pipelineId that admitted this product
  lastUpdatedByPipelineId?: string  // pipelineId of the last mutation
}

// ── Catalog Store ─────────────────────────────────────────────────────────────

export interface RuntimeCatalogStore {
  /** Monotonically incrementing write counter. */
  version:       number
  /** ISO timestamp of the last write. null on initial empty store. */
  updatedAt:     string | null
  /** Which process wrote last: 'system' | 'auto-fill' | 'repair' | 'manual' | etc. */
  updatedBy:     string
  /** Length of the products array — maintained automatically by the writer. */
  totalProducts: number
  products:      RuntimeProduct[]
}

// ── Category Config ───────────────────────────────────────────────────────────

export interface CategoryConfig {
  /** Minimum number of public-visible products required in this category. */
  minimum: number
}

export interface CategoryConfigStore {
  [slug: string]: CategoryConfig
}

// ── Deficit Report ────────────────────────────────────────────────────────────

export interface CategoryDeficit {
  category: string
  current:  number
  minimum:  number
  /** How many products need to be added. 0 = at or above minimum. */
  deficit:  number
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface RuntimeCatalogStats {
  totalProducts:       number
  activeProducts:      number
  inactiveProducts:    number
  unverifiedProducts:  number
  staleProducts:       number
  colombiaConfirmed:   number
  byCategory:          Record<string, number>
  version:             number
  updatedAt:           string | null
}
