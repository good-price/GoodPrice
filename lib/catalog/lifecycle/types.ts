/**
 * lib/catalog/lifecycle/types.ts
 *
 * Core types for the Catalog Lifecycle Engine — Sprint 4D.
 *
 * ProductLifecycle tracks the aging, health, and renewal state of every
 * product in the runtime catalog. The lifecycle store is a superset of
 * the runtime catalog: it augments each RuntimeProduct with temporal
 * intelligence (how long it has been live, how stale it is, whether it
 * needs replacement).
 *
 * SERVER-ONLY.
 */

// ── Health states ─────────────────────────────────────────────────────────────

export type LifecycleHealth = 'healthy' | 'aging' | 'stale' | 'critical'

// ── Per-product lifecycle record ──────────────────────────────────────────────

export interface ProductLifecycle {
  /** Amazon ASIN — primary key. */
  asin: string
  /** GOODPRICE category slug. */
  category: string

  /** ISO — when the product was first admitted into the runtime catalog. */
  firstSeenAt: string
  /** ISO — last time any pipeline touched this product. */
  lastSeenAt: string
  /** ISO — last live-truth or validation check. null if never validated. */
  lastValidatedAt: string | null
  /** ISO — last PAAPI price sync. null if never synced. */
  lastPriceSyncAt: string | null

  /** Days since firstSeenAt (computed fresh on every update). */
  ageDays: number
  /** Days since lastValidatedAt (or lastSeenAt if never validated). */
  staleDays: number

  /** Derived health state based on staleDays thresholds. */
  health: LifecycleHealth

  /** 0–100 — from trust engine or candidate intelligence. */
  confidenceScore: number
  /** 0–100 — from validation or admission scoring. */
  qualityScore: number

  /** Total number of successful validation events. */
  validationCount: number
  /** Total number of failed validation events (live-truth failures). */
  failureCount: number

  /** true when health is aging, stale, or critical — needs a fresh validation. */
  needsRefresh: boolean
  /** true when health is critical OR confidenceScore < 35. */
  needsReplacement: boolean
}

// ── Lifecycle store (persisted JSON) ──────────────────────────────────────────

export interface LifecycleStore {
  /** ISO — last write to the store. null before first sync. */
  updatedAt: string | null
  /** Keyed by ASIN. */
  products: Record<string, ProductLifecycle>
}

// ── Metrics (scan run tracking) ───────────────────────────────────────────────

export interface LifecycleMetricsFile {
  /** ISO — last time a lifecycle scan completed. */
  lastScanAt: string | null
  /** Cumulative count of lifecycle scans. */
  totalScans: number
  /** Wall-clock ms of the most recent scan. */
  lastScanDurationMs: number
  /** Products updated in the most recent scan. */
  lastScanUpdated: number
  /** Health breakdown from the most recent scan. */
  lastHealthBreakdown: {
    healthy:  number
    aging:    number
    stale:    number
    critical: number
  } | null
}
