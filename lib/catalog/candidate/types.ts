/**
 * lib/catalog/candidate/types.ts
 *
 * Types for the Candidate Validator and the Automated Catalog Admission system.
 */

// ── Validation types ──────────────────────────────────────────────────────────

export interface GateResult {
  gate:    number
  name:    string
  passed:  boolean
  /** The value that was tested (price, rating, count, etc.). */
  value?:  unknown
  /** Human-readable detail about why the gate passed or failed. */
  detail?: string
}

export interface CandidateValidationConfig {
  /** Minimum price in USD (inclusive). Default: 20 */
  minPrice?:    number
  /** Maximum price in USD (inclusive). Default: 300 */
  maxPrice?:    number
  /** Minimum star rating (inclusive). Default: 4.2 */
  minRating?:   number
  /** Minimum customer review count (inclusive). Default: 500 */
  minReviews?:  number
}

export type CandidateDecision = 'APPROVED' | 'REJECTED'

export interface CandidateValidationResult {
  /** ASIN submitted for validation. */
  asin:             string
  /** ASIN of the page actually fetched (may differ from asin when Amazon redirects). */
  finalAsin:        string
  /** Whether Amazon returned HTTP 200 for this ASIN. */
  http200:          boolean
  /** Whether the ASIN was silently redirected to a different ASIN. */
  redirected:       boolean
  /** Whether a USD price was extractable. */
  priceFound:       boolean
  price?:           number
  /** Whether a product image URL was found. */
  imageFound:       boolean
  imageUrl?:        string
  availability:     'available' | 'unavailable' | 'unknown'
  rating?:          number
  reviewCount?:     number
  /** Product title extracted from Amazon — populated on HTTP 200 pages. */
  title?:           string
  /** Brand extracted from Amazon — populated on HTTP 200 pages. */
  brand?:           string
  /**
   * Best-effort: true when no shipping-restriction phrase was detected in the
   * Amazon page HTML. NOTE: Restriction phrases for Colombia only appear when
   * Amazon is queried from a Colombian IP — this will read true for most
   * products served from a US-based server.
   */
  shipsToColombia:  boolean
  decision:         CandidateDecision
  /** Machine-readable rejection code, present only when decision is REJECTED. */
  reason?:          string
  /** Per-gate breakdown — every gate that was evaluated (pass or fail). */
  gates:            GateResult[]
  checkedAt:        string   // ISO 8601
  durationMs:       number
}

// ── Draft types (product pending promotion to catalog) ────────────────────────

export type DraftStatus = 'pending' | 'promoted' | 'dismissed'

/**
 * A ProductDraft is a fully validated product ready to enter the catalog.
 * Created by POST /api/catalog/candidate/admit on APPROVED validation.
 * A human must assign category, review the suggested ID, then promote it.
 */
export interface ProductDraft {
  draftId:      string       // e.g. "draft_B09XYZ12345_1718360000000"
  asin:         string
  finalAsin:    string
  status:       DraftStatus
  // Live data from Amazon (captured at validation time)
  title?:       string
  brand?:       string
  price:        number
  imageUrl:     string
  rating:       number
  reviewCount:  number
  // Suggested catalog fields (human reviews before promoting)
  suggestedId?: string       // e.g. "elec-025"
  category:     string       // provided by caller at admit time
  // Metadata
  submittedAt:  string       // ISO
  promotedAt?:  string       // ISO — set when status → promoted
  dismissedAt?: string       // ISO — set when status → dismissed
  validationReport: CandidateValidationResult
}

export interface DraftStore {
  updatedAt: string
  drafts:    ProductDraft[]
}

// ── Admission log (history of all validate + admit calls) ─────────────────────

export interface AdmissionLogEntry {
  asin:        string
  finalAsin:   string
  category?:   string
  decision:    CandidateDecision
  reason?:     string
  gatesFailed: string[]
  checkedAt:   string
  draftId?:    string   // set if APPROVED via /admit
}

export interface AdmissionLog {
  updatedAt: string
  entries:   AdmissionLogEntry[]
}
