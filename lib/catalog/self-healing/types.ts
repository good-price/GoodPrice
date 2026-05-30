/**
 * lib/catalog/self-healing/types.ts
 *
 * Type definitions for the GOODPRICE Self-Healing Catalog Automation System.
 *
 * The system autonomously: archives consistently-failing products, recovers
 * products that pass validation again, repairs price/image drift, suggests
 * replacements for dead products, and tracks all actions in a healing log.
 */

// ── Healing event (audit log entry) ──────────────────────────────────────────

export type HealingActionType =
  | 'suppress'              // product archived (auto-suppressed)
  | 'recover'               // product restored to public catalog
  | 'drift_repair'          // price or image override applied
  | 'replacement_suggestion'// replacement candidate identified (no auto-action)
  | 'stale_flagged'         // product flagged as stale (for queue priority boost)

export interface HealingEvent {
  productId:   string
  asin:        string
  action:      HealingActionType
  reason:      string
  truthScore:  number
  ts:          string   // ISO timestamp
}

// ── Stale product ─────────────────────────────────────────────────────────────

export interface StaledProduct {
  productId:      string
  asin:           string
  title:          string
  lastCheckedAt:  string | null
  truthScore:     number
  staleDays:      number    // days since last check (or since catalog load if never checked)
  reason:         'never_checked' | 'old_check' | 'low_score_stale'
}

// ── Drift repair ──────────────────────────────────────────────────────────────

export type DriftRepairType = 'price' | 'image'

export interface DriftRepair {
  productId:     string
  asin:          string
  type:          DriftRepairType
  /** Previous catalog value (for audit trail). */
  oldValue:      string | number
  /** New value applied via metadata-overrides.json. */
  newValue:      string | number
  /** Percentage delta (price repairs only). */
  deltaPct?:     number
  confidence:    string
  reason:        string
  appliedAt:     string
}

// ── Replacement suggestion ────────────────────────────────────────────────────

export interface ReplacementCandidate {
  productId:     string
  asin:          string
  title:         string
  price:         number
  category:      string
  similarity:    number   // Jaccard title similarity to the failed product
  priceDeltaPct: number   // price difference %
}

export interface ReplacementSuggestion {
  /** Failed / suppressed product being replaced. */
  failedProductId:  string
  failedAsin:       string
  failedTitle:      string
  failedReason:     string
  /** Up to 3 ordered candidates (best first). */
  candidates:       ReplacementCandidate[]
  generatedAt:      string
}

// ── Self-healing report ───────────────────────────────────────────────────────

export interface SelfHealingReport {
  generatedAt:      string
  /** Number of healing cycles run since the system started. */
  cycleCount:       number
  /** ISO timestamp of the most recent healing cycle. */
  lastCycleAt:      string | null

  // ── Actions from the latest cycle ────────────────────────────────────────
  newlySuppressed:  HealingEvent[]
  newlyRecovered:   HealingEvent[]
  driftRepairs:     DriftRepair[]
  replacements:     ReplacementSuggestion[]
  staleProducts:    StaledProduct[]

  // ── Rolling totals ────────────────────────────────────────────────────────
  /** Count of products currently in auto-suppression. */
  suppressedCount:  number
  /** Total recoveries performed across all cycles. */
  recoveredAllTime: number
  /** Total drift repairs applied across all cycles. */
  driftRepairsAllTime: number
}

// ── Healing cycle options & result ───────────────────────────────────────────

export interface HealingCycleOptions {
  /** If true, log actions but do not write any files. Default: false. */
  dryRun?:                  boolean
  /** Max products to archive per cycle. Default: 10. */
  maxArchive?:              number
  /** Max products to recover per cycle. Default: 20. */
  maxRecover?:              number
  /** Max drift repairs to apply per cycle. Default: 20. */
  maxDriftRepairs?:         number
  /** Minimum truth score required to un-suppress a product. Default: 60. */
  minRecoveryScore?:        number
  /** Number of consecutive bad checks needed before archiving. Default: 2. */
  archiveConsecutiveChecks?: number
  /** Truth score threshold below which a product may be archived. Default: 30. */
  archiveScoreThreshold?:   number
}

export interface HealingCycleResult {
  ok:           boolean
  dryRun:       boolean
  durationMs:   number
  archived:     HealingEvent[]
  recovered:    HealingEvent[]
  driftRepairs: DriftRepair[]
  replacements: ReplacementSuggestion[]
  stale:        StaledProduct[]
  report:       SelfHealingReport
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export interface HealingSchedule {
  lastCycleAt:    string | null
  cycleCount:     number
  nextAllowedAt:  string | null
}
