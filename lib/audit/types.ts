/**
 * GOODPRICE Audit System — Core Types
 *
 * All audit data structures live here. Nothing is deleted — the audit system
 * classifies, scores, and optionally quarantines. No destructive operations.
 *
 * Severity ladder:
 *   critical → product should be quarantined (dead link, invalid ASIN)
 *   warning  → product has issues but may still work (image slow, no brand)
 *   info     → minor quality gap (unconfirmed Colombia shipping)
 *   ok       → check passed with no issues
 */

// ── Shared primitives ─────────────────────────────────────────────────────────

export type AuditSeverity = 'critical' | 'warning' | 'info' | 'ok'

export type ReliabilityGrade = 'A' | 'B' | 'C' | 'D' | 'F'

// ── Per-check result types ────────────────────────────────────────────────────

/** Result of checking whether an ASIN format is valid and the Amazon page exists */
export interface AsinCheckResult {
  productId:   string
  asin:        string
  /** Passes /^[A-Z0-9]{10}$/ */
  formatValid: boolean
  /** HTTP status returned by amazon.com/dp/<ASIN> — undefined on network error */
  httpStatus?: number
  /** true = page exists (200/301/302), false = 404, null = unknown (network error) */
  reachable:   boolean | null
  checkedAt:   string
  /** Populated on unexpected network/fetch error */
  error?:      string
  severity:    AuditSeverity
  notes:       string[]
}

/** Result of checking whether a product image URL is accessible */
export interface ImageCheckResult {
  productId:    string
  imageUrl:     string
  accessible:   boolean
  httpStatus?:  number
  /** MIME type from Content-Type header, e.g. "image/jpeg" */
  contentType?: string
  checkedAt:    string
  error?:       string
  severity:     AuditSeverity
  notes:        string[]
}

/** Result of checking required fields and data quality */
export interface CompletenessCheckResult {
  productId:         string
  /** Field names that are missing or empty */
  missingFields:     string[]
  /** Values that look suspicious but aren't missing (e.g. price === 0) */
  suspiciousValues:  string[]
  severity:          AuditSeverity
  notes:             string[]
}

/** Result of checking Colombia shipping eligibility */
export interface ColombiaCheckResult {
  productId:          string
  /** Passes all Colombia rules (no block-severity restriction) */
  shippable:          boolean
  /** Reason string from the matching ColombiaRule, if blocked */
  restriction?:       string
  /** Value of shipsToColombiaConfirmed field in the catalog */
  confirmedShipping:  boolean
  severity:           AuditSeverity
  notes:              string[]
}

// ── Composite reliability score ───────────────────────────────────────────────

/**
 * Full reliability record for a single product.
 * Combines all four checks into a single 0–100 score.
 *
 * Scoring weights:
 *   ASIN format valid       → +25
 *   Amazon page reachable   → +25
 *   Image accessible        → +20
 *   Data complete           → +15
 *   Colombia shippable      → +10
 *   Catalog status active   → +5  (bonus)
 *
 * Total possible: 100
 * Grades: A ≥ 90 · B ≥ 70 · C ≥ 50 · D ≥ 30 · F < 30
 */
export interface ProductReliabilityScore {
  productId:        string
  asin:             string
  title:            string
  category:         string
  brand?:           string
  catalogStatus?:   string
  /** Computed 0–100 */
  score:            number
  grade:            ReliabilityGrade
  quarantined:      boolean
  asinCheck:        AsinCheckResult
  imageCheck:       ImageCheckResult
  completenessCheck: CompletenessCheckResult
  colombiaCheck:    ColombiaCheckResult
  auditedAt:        string
}

// ── Flat audit record (for tables / export) ───────────────────────────────────

/** Compact summary used in report tables and API responses */
export interface AuditRecord {
  productId:    string
  asin:         string
  title:        string
  category:     string
  brand?:       string
  score:        number
  grade:        ReliabilityGrade
  /** Top issues from all checks — max 5 strings */
  issues:       string[]
  severity:     AuditSeverity
  quarantined:  boolean
  auditedAt:    string
}

// ── Full catalog audit report ─────────────────────────────────────────────────

export interface CatalogAuditReport {
  /** UUID-style run identifier */
  runId:          string
  startedAt:      string
  completedAt:    string
  durationMs:     number
  totalProducts:  number

  /** Score letter-grade distribution */
  gradeDistribution: {
    A: number
    B: number
    C: number
    D: number
    F: number
  }

  /** Average reliability score across all products */
  averageScore: number

  /** Counts of specific issue types */
  issues: {
    invalidAsinFormat:   number
    unreachableProducts: number  // 404 on Amazon
    brokenImages:        number
    incompleteProducts:  number
    colombiaRestricted:  number
    quarantined:         number
  }

  /** Products with grade D or F — require immediate attention */
  criticalProducts: AuditRecord[]

  /** All products with their full reliability score (sorted by score asc) */
  products: ProductReliabilityScore[]
}

// ── Quarantine ────────────────────────────────────────────────────────────────

export interface QuarantineEntry {
  productId:      string
  asin:           string
  title:          string
  category:       string
  reason:         string
  quarantinedAt:  string
  /** 'audit' = added automatically by audit job; 'manual' = added via admin */
  quarantinedBy:  'audit' | 'manual'
  score?:         number
  issues?:        string[]
}

/** Shape of data/audit/quarantine.json */
export interface QuarantineStore {
  updatedAt: string
  /** Keyed by productId */
  entries:   Record<string, QuarantineEntry>
}
