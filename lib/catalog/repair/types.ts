/**
 * lib/catalog/repair/types.ts
 *
 * All types for the GOODPRICE autonomous catalog repair pipeline.
 */

// ── Reason a product needs repair ─────────────────────────────────────────────

export type RepairReason =
  | 'broken_image_cdn'       // images-na CDN → needs CDN swap or PA-API
  | 'invalid_image_url'      // empty or non-URL image field
  | 'invalid_asin_format'    // ASIN doesn't match /^[A-Z0-9]{10}$/
  | 'inactive_asin'          // Amazon returns 404 for this ASIN
  | 'quarantined'            // in data/audit/quarantine.json
  | 'low_audit_score'        // latest audit score < MIN_PUBLIC_SCORE
  | 'auto_suppressed'        // 2+ consecutive audit failures
  | 'colombia_restricted'    // colombiaRestriction is set
  | 'missing_image_hash'     // images/P/ format — can't fix without PA-API

// ── Repair status after pipeline run ──────────────────────────────────────────

export type RepairStatus =
  | 'auto_replaced'           // patch applied automatically (confidence >= threshold)
  | 'manual_review_required'  // candidate found but confidence < threshold
  | 'no_candidate_found'      // no viable replacement found
  | 'needs_paapi'             // requires PA-API credentials to fix
  | 'skipped'                 // excluded by options (e.g. dryRun=true or limit reached)

// ── Candidate image URL types ──────────────────────────────────────────────────

export type CandidateSource =
  | 'cdn_swap'          // simple CDN prefix substitution (images-na → m.media-amazon)
  | 'mercadolibre'      // found via MercadoLibre free search API
  | 'amazon_page'       // scraped from Amazon product page (fragile, low priority)
  | 'manual'            // manually provided by admin

// ── Candidate score breakdown ──────────────────────────────────────────────────

export interface CandidateScoreBreakdown {
  imageScore: number       // 0-25: valid URL + responds 200
  titleScore: number       // 0-25: Jaccard similarity to original title
  priceScore: number       // 0-20: within ±40% of original price
  reviewScore: number      // 0-15: availability + review count indicator
  categoryScore: number    // 0-15: category match confirmation
}

// ── A single repair candidate ──────────────────────────────────────────────────

export interface RepairCandidate {
  source: CandidateSource
  /** New image URL to use (if image repair) */
  imageUrl?: string
  /** New ASIN to use (if product replacement — requires verification) */
  asin?: string
  /** Title of the candidate product */
  title?: string
  /** Price of candidate (USD) */
  price?: number
  /** MercadoLibre item ID (for reference) */
  mlItemId?: string
  /** MercadoLibre permalink (for admin review) */
  mlPermalink?: string
  /** Overall confidence 0–100 */
  confidence: number
  scoreBreakdown: CandidateScoreBreakdown
  /** Whether the image URL was verified with a HEAD request */
  imageVerified?: boolean
  notes?: string
}

// ── A patch to apply to a catalog file ────────────────────────────────────────

export interface CatalogPatch {
  /** Catalog file path (relative to cwd) e.g. data/catalog/electronica.ts */
  filePath: string
  productId: string
  field: 'image' | 'asin' | 'status' | 'title' | 'price' | 'rating' | 'reviews'
  oldValue: string
  newValue: string
}

// ── A single repair job (one product) ─────────────────────────────────────────

export interface RepairJob {
  productId: string
  asin: string
  title: string
  category: string
  reasons: RepairReason[]
  candidates: RepairCandidate[]
  /** Best candidate selected, or null */
  selectedCandidate: RepairCandidate | null
  /** Applied patches (may be empty on dryRun or manual_review) */
  patches: CatalogPatch[]
  status: RepairStatus
  confidence: number
  error?: string
  createdAt: string
}

// ── History entry (persisted to disk) ─────────────────────────────────────────

export interface ReplacementEntry {
  productId: string
  previousAsin: string
  previousImage?: string
  replacementAsin?: string
  replacementImage?: string
  reason: RepairReason
  confidence: number
  status: RepairStatus
  timestamp: string
  /** Human-readable note */
  note?: string
}

export interface FailureEntry {
  productId: string
  asin: string
  reasons: RepairReason[]
  attemptedAt: string
  error: string
}

export interface HistoryFile<T> {
  version: number
  entries: T[]
}

// ── Pipeline options ───────────────────────────────────────────────────────────

export interface RepairOptions {
  /** Max products to process per run (Vercel 60s limit) */
  limit?: number
  /** If true, analyse but do NOT patch any files */
  dryRun?: boolean
  /** Only process specific categories */
  categories?: string[]
  /** Only repair specific reason types */
  reasons?: RepairReason[]
  /** Minimum confidence to auto-apply (default: 85) */
  confidenceThreshold?: number
}

// ── Pipeline result ────────────────────────────────────────────────────────────

export interface PipelineResult {
  runAt: string
  dryRun: boolean
  processed: number
  autoRepaired: number
  manualReview: number
  noCandidate: number
  needsPaapi: number
  jobs: RepairJob[]
  durationMs: number
}

// ── Repair report (admin dashboard) ───────────────────────────────────────────

export interface CategoryRepairStats {
  slug: string
  totalProducts: number
  needsRepair: number
  repaired: number
  manualReview: number
  needsPaapi: number
}

export interface RepairReport {
  generatedAt: string
  /** Total products in public catalog */
  totalProducts: number
  /** Products currently failing public gates */
  productsNeedingRepair: number
  /** Products repaired in all time (from history) */
  repairedAllTime: number
  /** Products waiting manual review */
  pendingManualReview: number
  /** Products needing PA-API to fix */
  needsPaapi: number
  /** All-time success rate (repaired / attempted) */
  successRate: number
  /** Most recent pipeline run result */
  lastRun: PipelineResult | null
  /** Per-category stats */
  byCategory: CategoryRepairStats[]
  /** Last 20 replacements */
  recentReplacements: ReplacementEntry[]
  /** Products currently unfixable */
  openFailures: FailureEntry[]
}
