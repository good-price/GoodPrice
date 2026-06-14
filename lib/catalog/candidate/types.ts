/**
 * lib/catalog/candidate/types.ts
 *
 * Types for the Candidate Validator — the gate system that determines
 * whether a new ASIN is fit for the GOODPRICE catalog before it is added.
 */

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
