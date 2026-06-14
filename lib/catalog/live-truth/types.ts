/**
 * lib/catalog/live-truth/types.ts
 *
 * All types for the GOODPRICE Live Product Truth system.
 *
 * The system continuously validates whether catalog data still matches the
 * real Amazon product — detecting price staleness, product drift, availability
 * issues, and fake discounts without requiring browser automation.
 */

// ── Extraction confidence ─────────────────────────────────────────────────────

/**
 * How reliable the data extracted from Amazon's page was.
 *
 *   high   → JSON-LD was present and ≥ 2 fields extracted cleanly
 *   medium → No JSON-LD but ≥ 2 fields extracted via regex/meta tags
 *   low    → Only 1 field could be extracted
 *   failed → Network error, timeout, robot-check, or nothing extractable
 */
export type ExtractionConfidence = 'high' | 'medium' | 'low' | 'failed'

// ── Availability status ───────────────────────────────────────────────────────

export type AvailabilityStatus =
  | 'in_stock'    // Confirmed available
  | 'limited'     // Low stock signal
  | 'out_of_stock' // Explicitly out of stock
  | 'unavailable' // "Currently unavailable" / discontinued / archived
  | 'unknown'     // Could not determine

// ── Overall product validation status ────────────────────────────────────────

export type ValidationStatus =
  | 'valid'        // All dimensions pass, truth score ≥ 70
  | 'drifted'      // Title or category changed significantly
  | 'unavailable'  // Product confirmed unavailable on Amazon
  | 'suspect'      // Truth score 40–69 — needs review
  | 'failed'       // Extraction failed — no judgment possible
  | 'unverified'   // Not yet validated

// ── Raw extracted data ────────────────────────────────────────────────────────

export interface ExtractedProductData {
  title?:             string
  priceUSD?:          number
  oldPriceUSD?:       number
  availability?:      string   // raw text or schema.org URL
  availabilityStatus: AvailabilityStatus
  imageUrl?:          string
  brand?:             string
  confidence:         ExtractionConfidence
  httpStatus?:        number
  isRobotCheck:       boolean
  rawHtmlLength:      number
  /** Final URL after following HTTP redirects — used to detect ASIN redirects. */
  finalUrl?:          string
  /**
   * Currency symbol found in the a-price-symbol span ('$', 'COP', 'EUR', …).
   * Absent when no price block was found on the page.
   * Used to reject non-USD prices before writing overrides.
   */
  detectedCurrency?:  string
}

// ── Per-dimension validation results ─────────────────────────────────────────

export interface TitleValidation {
  score:         number    // 0–30
  similarity:    number    // 0–1 Jaccard on word tokens
  hasDrift:      boolean
  catalogTitle:  string
  extractedTitle: string
  reason:        string
}

export interface PricingValidation {
  score:           number   // 0–25
  catalogPriceUSD: number
  livePrice?:      number
  deltaPct?:       number   // signed: negative = cheaper live
  hasFakeDiscount: boolean
  discountPct?:    number   // catalogue oldPrice vs livePrice
  reason:          string
}

export interface AvailabilityValidation {
  score:       number   // 0–25
  isAvailable: boolean
  status:      AvailabilityStatus
  rawText?:    string
  reason:      string
}

export interface ImageValidation {
  score:       number   // 0–10
  hasImage:    boolean
  urlChanged:  boolean
  reason:      string
}

// ── Composite result per product ──────────────────────────────────────────────

export interface LiveTruthResult {
  productId: string
  asin:      string
  checkedAt: string   // ISO timestamp

  // Raw extraction
  extracted: ExtractedProductData

  // Per-dimension scores
  title:        TitleValidation
  pricing:      PricingValidation
  availability: AvailabilityValidation
  image:        ImageValidation

  // Composite truth score 0–100 (sum of all dimension scores)
  truthScore: number

  // Denormalised flags for quick filtering
  status:          ValidationStatus
  isAvailable:     boolean
  hasFakeDiscount: boolean
  hasTitleDrift:   boolean
  hasImageDrift:   boolean
  confidence:      ExtractionConfidence

  // Human-readable issues list
  issues: string[]
}

// ── File-based result store ───────────────────────────────────────────────────

export interface TruthResultStore {
  updatedAt: string
  /** productId → latest result */
  results:   Record<string, LiveTruthResult>
}

// ── Report (aggregated stats) ─────────────────────────────────────────────────

export interface TruthReport {
  generatedAt: string

  // Coverage
  totalChecked:    number
  totalInCatalog:  number   // how many public products exist

  // Status counts
  validCount:       number
  driftedCount:     number
  unavailableCount: number
  suspectCount:     number
  failedCount:      number

  // Flag counts
  fakeDiscountCount: number
  titleDriftCount:   number
  imageDriftCount:   number

  // Score stats
  avgTruthScore: number
  lowScoreCount: number   // score < 40

  // Action lists (productIds)
  quarantineRecommendations: string[]

  // All latest results (productId → result)
  results: Record<string, LiveTruthResult>
}

// ── Revalidation queue ────────────────────────────────────────────────────────

export interface QueueItem {
  productId:     string
  asin:          string
  /** Higher value = should be checked sooner */
  priority:      number
  lastCheckedAt: string | null
  reason:        string
}

export interface ValidationQueue {
  updatedAt: string
  items:     QueueItem[]
}
