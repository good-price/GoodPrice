/**
 * Trusted Product Engine v1 — Core Types
 *
 * Zero-Trust catalog system. Products are OUT by default.
 * A product earns a catalog slot only by passing all 10 hard gates.
 * A single gate failure — during admission or revalidation — triggers
 * immediate expulsion. No partial credit. No grace periods. No queues.
 *
 * Data stores (JSON, mutable at runtime):
 *   data/tpe/candidate-pool.json    → CandidatePoolStore
 *   data/tpe/trusted-catalog.json   → TrustedCatalogStore
 *   data/tpe/expulsion-log.json     → ExpulsionLog
 */

// ── Candidate provenance ────────────────────────────────────────────────────────

export type CandidateSource =
  | 'legacy_migration'   // migrated from data/catalog/ TypeScript files
  | 'manual_submission'  // added directly by admin
  | 'discovery_engine'   // suggested by lib/catalog/intelligence/discovery-engine
  | 'paapi_search'       // found via PA-API lookup

// ── Candidate lifecycle states ──────────────────────────────────────────────────

export type CandidateStatus =
  | 'pending'            // never evaluated
  | 'evaluating'         // gates are currently running for this candidate
  | 'approved'           // all 7 business gates + 2 presentation gates pass → ACTIVE
  | 'approved_degraded'  // all 7 business gates pass, ≥1 presentation gate fails → IMAGE_DEGRADED
  | 'rejected'           // failed at least one business gate
  | 'exhausted'          // rejected ≥ 3 times — deprioritized from evaluation queue
  | 'in_catalog'         // currently occupies a slot in TrustedCatalogStore

// ── Hard gate identifiers ───────────────────────────────────────────────────────
//
// Gates 1–6 are local (no HTTP). They run first.
// Gates 7–10 involve HTTP calls or time checks. They run last.
// Execution order matches the numeric sequence below.

export type GateId =
  | 'asin_format'           // 1 — /^[A-Z0-9]{10}$/ test
  | 'data_complete'         // 2 — 0 missing required fields, 0 suspicious values
  | 'price_valid'           // 3 — price > 0, finite, < 50 000
  | 'colombia_unrestricted' // 4 — colombiaRestriction is null/undefined
  | 'colombia_confirmed'    // 5 — shipsToColombiaConfirmed === true
  | 'status_active'         // 6 — status field === 'active'
  | 'amazon_reachable'      // 7 — HTTP 200/30x confirmed on amazon.com/dp/<ASIN>
  | 'image_not_placeholder' // 8 — not /P/ format, not in broken-URL blocklist
  | 'image_accessible'      // 9 — HTTP 200, Content-Type: image/*
  | 'validation_fresh'      // 10 — lastValidatedAt < 7 days ago (revalidation only)

// ── Gate result (atomic, binary) ────────────────────────────────────────────────
//
// `passed` is always a boolean — never null, never partial.
// `detail` carries the failure reason when passed === false.

export interface GateResult {
  gateId:      GateId
  passed:      boolean
  checkedAt:   string    // ISO 8601
  detail?:     string    // failure reason; undefined when passed === true
  httpStatus?: number    // populated by HTTP gates (7, 9)
  durationMs:  number
}

// ── Validation bundle ────────────────────────────────────────────────────────────
//
// Wraps the result of one full evaluation pass (all 10 gates).
// `allPassed` is always derived — never set manually.
// If gates.some(g => !g.passed) then allPassed must be false.
// Early-exit evaluations will have fewer than 10 entries in `gates`
// (first failing gate stops execution; gates after it are omitted).

export interface ValidationBundle {
  candidateId:         string
  asin:                string
  allPassed:           boolean  // true only when all 9 admission gates pass (ACTIVE state)
  businessGatesPassed: boolean  // true when all 7 business gates pass (ACTIVE or IMAGE_DEGRADED)
  gates:               GateResult[]    // ≤ 10 entries; stops at first failure
  evaluatedAt:         string          // ISO 8601
  evaluatedBy:         'system' | 'admin'
  durationMs:          number
}

// ── Candidate record ─────────────────────────────────────────────────────────────
//
// Lives in CandidatePoolStore. Never deleted — only status changes.
// The pool is an immutable log of every candidate ever considered.

export interface CandidateRecord {
  // ── Product identity ──────────────────────────────────────────────────────────
  id:                        string
  asin:                      string
  title:                     string
  category:                  string
  brand?:                    string
  image:                     string
  price:                     number
  oldPrice?:                 number
  rating:                    number
  reviews:                   number
  badge?:                    string
  isTopSeller?:              boolean
  isOffer?:                  boolean
  description?:              string
  shipsToColombiaConfirmed?: boolean
  colombiaRestriction?:      string
  // Original product status from legacy catalog — Gate 6 (status_active) reads this.
  // Distinct from `status` below (which is the candidate's lifecycle state in the pool).
  productStatus?:            'active' | 'inactive' | 'unverified' | 'stale'

  // ── Provenance ────────────────────────────────────────────────────────────────
  source:  CandidateSource
  addedAt: string              // ISO 8601 — when this record was added to the pool

  // ── Evaluation state ──────────────────────────────────────────────────────────
  status:           CandidateStatus
  evaluationCount:  number      // total evaluation attempts across all time
  lastBundle?:      ValidationBundle
  firstApprovedAt?: string      // ISO 8601 — first time all gates passed
  rejectedAt?:      string      // ISO 8601 — most recent rejection timestamp
  rejectionGate?:   GateId      // which gate caused the most recent rejection
  notes?:           string      // freeform admin note

  // ── Image recovery metadata ───────────────────────────────────────────────────
  recoveryMetadata?: RecoveryMetadata
}

// ── Trusted product display states ───────────────────────────────────────────────
//
// Phase 3D: Business Trust / Presentation Trust separation.
//
//   'active'        — all 7 business gates + 2 presentation gates pass.
//                     Shown with real Amazon CDN image.
//   'image_degraded'— all 7 business gates pass, at least 1 presentation gate fails.
//                     Link is valid; shown with getCategoryPlaceholder() instead of image.
//   'retired'       — was active or image_degraded; a business gate failed in revalidation.
//                     Slot freed; candidate returned to pool as rejected.

export type TrustedProductDisplayState = 'active' | 'image_degraded' | 'retired'

// ── Trusted product ──────────────────────────────────────────────────────────────
//
// A CandidateRecord that has been promoted to a catalog slot.
// Contains only the fields needed by the public UI + trust metadata.
// `amazonUrl` is built from `asin` via buildAffiliateUrl() at promotion time.

export interface TrustedProduct {
  // ── Public fields (mapped from CandidateRecord) ───────────────────────────────
  id:           string
  asin:         string
  title:        string
  category:     string
  brand?:       string
  image:        string
  price:        number
  oldPrice?:    number
  rating:       number
  reviews:      number
  badge?:       string
  isTopSeller?: boolean
  isOffer?:     boolean
  description?: string
  amazonUrl:    string          // built at promotion time, not stored in CandidateRecord

  // ── Trust metadata ────────────────────────────────────────────────────────────
  admittedAt:       string                  // ISO 8601 — when the slot was first assigned
  lastValidatedAt:  string                  // ISO 8601 — most recent successful revalidation
  validUntil:       string                  // ISO 8601 — lastValidatedAt + 7 days
  validationBundle: ValidationBundle
  slotIndex:        number                  // 0–199, permanent for the lifetime of this admission
  displayState:     TrustedProductDisplayState
}

// ── Stores ────────────────────────────────────────────────────────────────────────

export interface CandidatePoolStore {
  version:    number
  updatedAt:  string            // ISO 8601 — last write timestamp
  candidates: CandidateRecord[]
}

export interface TrustedCatalogStore {
  version:   number
  updatedAt: string             // ISO 8601 — last write timestamp
  slots:     (TrustedProduct | null)[]  // always exactly 200 entries; null = empty slot
}

// ── Expulsion ─────────────────────────────────────────────────────────────────────

export type ExpulsionReason =
  | 'gate_failure'    // a gate returned passed === false during revalidation
  | 'window_expired'  // validUntil < Date.now() — revalidation not completed in time
  | 'manual'          // admin-triggered expulsion

export interface ExpulsionRecord {
  productId:   string
  asin:        string
  slotIndex:   number
  expelledAt:  string          // ISO 8601
  reason:      ExpulsionReason
  failedGate?: GateId          // populated when reason === 'gate_failure'
  gateDetail?: string          // detail message from the failed gate
  trustedDays: number          // floor((expelledAt - admittedAt) / 86_400_000)
}

export interface ExpulsionLog {
  version: number
  entries: ExpulsionRecord[]   // append-only; never modified after write
}

// ── Coverage KPI ──────────────────────────────────────────────────────────────────
//
// Computed on-the-fly from CandidatePoolStore + TrustedCatalogStore.
// Never persisted — always derived.

export interface CategoryCoverage {
  slug:            string
  trusted:         number
  approved:        number
  pending:         number
  rejected:        number
  coveragePercent: number      // trusted / trustedCount (across catalog) * 100
}

export interface TrustedCoverageKPI {
  // ── Slot counts ───────────────────────────────────────────────────────────────
  totalSlots:      200          // literal — catalog capacity is always 200
  trustedCount:    number       // deprecated alias for workingTotal; kept for compatibility

  // ── Phase 3D: two-tier coverage ───────────────────────────────────────────────
  //
  //   workingTotal      = ACTIVE + IMAGE_DEGRADED
  //                       products in catalog with a valid, clickable affiliate link
  //   fullTrustCount    = ACTIVE only
  //                       products with verified image + valid link (highest quality)
  //   imageDegradedCount= IMAGE_DEGRADED only
  //                       products with valid link but placeholder image shown
  //
  activeCount:            number
  imageDegradedCount:     number
  workingTotal:           number  // activeCount + imageDegradedCount
  workingCoveragePercent: number  // workingTotal / 200 * 100
  fullTrustCoveragePercent: number // activeCount / 200 * 100
  emptySlots:             number

  // ── Pool pipeline counts ──────────────────────────────────────────────────────
  pendingCandidates:    number
  evaluatingNow:        number
  approvedWaiting:      number    // 'approved' status, not yet in a slot
  approvedDegradedWaiting: number // 'approved_degraded' status, not yet in a slot
  rejectedTotal:        number    // failed a business gate
  exhaustedTotal:       number

  // ── Trust health ──────────────────────────────────────────────────────────────
  businessGatePassRate:  number   // (approved + approved_degraded) / total evaluated * 100
  fullGatePassRate:      number   // approved / total evaluated * 100
  avgValidationAgeDays:  number
  expiringIn24h:         number
  expiringIn48h:         number

  // ── Per-category breakdown ────────────────────────────────────────────────────
  byCategory: CategoryCoverage[]

  computedAt: string             // ISO 8601
}

// ── Revalidation report ───────────────────────────────────────────────────────────
//
// Returned by lib/tpe/revalidation.ts after a revalidation pass.
// Not persisted — returned to the caller (API route or admin UI).

export interface RevalidationRecord {
  productId:  string
  asin:       string
  slotIndex:  number
  outcome:    'revalidated' | 'expelled'
  bundle:     ValidationBundle
  expulsion?: ExpulsionRecord
}

export interface RevalidationReport {
  runAt:         string          // ISO 8601
  durationMs:    number
  total:         number          // products evaluated in this run
  revalidated:   number
  expelled:      number
  records:       RevalidationRecord[]
}

// ── Image Recovery types ──────────────────────────────────────────────────────────
//
// Used by lib/tpe/recovery/ and stored in CandidateRecord.recoveryMetadata.
// Only 'verified' confidence allows writing to the pool.

export type ImageRecoveryConfidence = 'recovered' | 'verified' | 'broken'

export type ImageRecoverySource =
  | 'cdn_swap'   // images-na /I/ -> m.media-amazon.com /I/ (Tier 1)
  | 'paapi'      // PA-API GetItems -> Images.Primary (Tier 2, future)
  | 'manual'     // admin-provided URL

export interface ImageRecoveryAttempt {
  attemptedAt:  string                  // ISO 8601
  source:       ImageRecoverySource
  originalUrl:  string                  // URL before recovery
  recoveredUrl?: string                 // URL built but not yet verified
  verifiedUrl?:  string                 // URL confirmed HTTP 200
  confidence:   ImageRecoveryConfidence
  httpStatus?:  number
  detail?:      string
  durationMs:   number
}

export interface RecoveryMetadata {
  lastAttemptAt:  string                // ISO 8601
  lastConfidence: ImageRecoveryConfidence
  source?:        ImageRecoverySource
  verifiedUrl?:   string                // last verified URL (used in candidate.image)
  verifiedAt?:    string                // ISO 8601 — when verifiedUrl was confirmed
  attempts:       ImageRecoveryAttempt[] // full audit trail, append-only
}

// ── Vacancy Engine types ──────────────────────────────────────────────────────────
//
// Sprint 4B — Vacancy Engine
//
// A Vacancy represents a detected under-representation in a catalog category.
// The engine computes deficits against a per-category target (default 20 slots)
// and assigns priority based on how severe the gap is.
//
// Priority rules:
//   critical  — deficit >= 6  (category badly under-represented)
//   high      — deficit >= 4
//   medium    — deficit >= 2
//   low       — deficit >= 1
//
// Surplus categories (current > target) are recorded in the queue metadata
// but never generate a Vacancy — they are informational only.
//
// Data store: data/tpe/vacancy-queue.json (VacancyQueueStore)

/** How urgently a category vacancy needs to be filled. */
export type VacancyPriority = 'critical' | 'high' | 'medium' | 'low'

/** Lifecycle state of a single vacancy. */
export type VacancyStatus =
  | 'open'         // deficit detected, not yet being worked
  | 'in_progress'  // Discovery Engine or admin is sourcing candidates
  | 'filled'       // deficit closed — target reached
  | 'closed'       // manually closed without reaching target (e.g. category removed)

/**
 * A single under-representation gap for one category.
 * Created by computeVacancies(); consumed by the Discovery Engine (Sprint 5+).
 */
export interface Vacancy {
  id:           string           // "vac-{category}" — one active vacancy per category
  category:     string
  priority:     VacancyPriority
  status:       VacancyStatus
  currentCount: number           // catalog slots currently held by this category
  targetCount:  number           // configured target (from VacancyQueueStore.targetPerCategory)
  slotsNeeded:  number           // targetCount - currentCount  (always ≥ 1 for open/in_progress)
  createdAt:    string           // ISO 8601 — when this vacancy was first opened
  updatedAt:    string           // ISO 8601 — last computeVacancies() run
  closedAt?:    string           // ISO 8601 — set when status = 'filled' | 'closed'
  notes?:       string           // freeform admin annotation
}

/**
 * Per-category state snapshot embedded in the queue store.
 * Records every category (including balanced and surplus) for full auditability.
 */
export interface CategoryRepresentation {
  category:     string
  currentCount: number
  targetCount:  number
  delta:        number           // currentCount - targetCount  (negative = deficit)
  status:       'deficit' | 'balanced' | 'surplus'
}

/** Persisted store for the vacancy queue. */
export interface VacancyQueueStore {
  version:            number
  updatedAt:          string           // ISO 8601 — last write
  targetPerCategory:  number           // configurable target per category (default 20)
  allCategories:      string[]         // all known categories
  vacancies:          Vacancy[]
  /** Full category representation snapshot from last computeVacancies() run. */
  categorySnapshot:   CategoryRepresentation[]
}

/** KPIs computed from the current vacancy queue state. */
export interface VacancyKPI {
  /** Total catalog slots configured (allCategories.length × targetPerCategory) */
  totalTargetSlots:     number
  /** Slots currently filled in the catalog */
  filledSlots:          number
  /** Number of open or in_progress vacancies */
  vacancyCount:         number
  /** Total slots needed across all open/in_progress vacancies */
  totalSlotsNeeded:     number
  /**
   * Vacancy Severity Score — priority-weighted sum of slots needed.
   * critical slot = 4 pts · high = 3 pts · medium = 2 pts · low = 1 pt
   * Lower is better. 0 means the catalog is fully balanced.
   */
  vacancySeverityScore: number
  /**
   * Representation Balance — percentage of categories within ±2 of their target.
   * 100% = all categories balanced.  Lower = more imbalance.
   */
  representationBalance: number        // 0–100
  /** Categories with deficit (sorted by severity desc) */
  deficitCategories:    CategoryRepresentation[]
  /** Categories matching or exceeding their target */
  surplusCategories:    CategoryRepresentation[]
  /** Categories exactly at their target (delta === 0) */
  balancedCategories:   CategoryRepresentation[]
  computedAt:           string         // ISO 8601
}

// ── Discovery Engine types ────────────────────────────────────────────────────────
//
// Sprint 5A — Discovery Lite
//
// The Discovery Engine finds new product candidates to fill Vacancy Queue gaps.
// In Sprint 5A it uses a 'mock' source (simulated data) to validate the pipeline.
// Future sprints will connect 'paapi' (Amazon PA-API) and other real sources.
//
// Data store: data/tpe/discovery-log.json (DiscoveryLogStore, append-only)

/** Where a discovery batch's candidates were sourced from. */
export type DiscoverySource =
  | 'mock'     // Sprint 5A — simulated data, validates pipeline architecture
  | 'paapi'    // Sprint 5B+ — Amazon Product Advertising API
  | 'scraper'  // future — web scraper
  | 'manual'   // admin-submitted directly

/** Outcome status of a completed DiscoveryJob. */
export type DiscoveryJobStatus = 'completed' | 'partial' | 'failed'

/**
 * Raw product data emitted by any discovery source before conversion
 * into a CandidateRecord.  candidate-builder.ts consumes this interface.
 *
 * All fields that affect Gate 1–6 passage are required:
 *   asin              → Gate 1 (asin_format)
 *   title/category/image/price/rating/reviews → Gate 2 (data_complete)
 *   price             → Gate 3 (price_valid)
 *   shipsToColombiaConfirmed → Gate 5 (colombia_confirmed)
 *   (no colombiaRestriction) → Gate 4 (colombia_unrestricted)
 */
export interface DiscoveryCandidate {
  asin:                      string
  title:                     string
  category:                  string
  brand?:                    string
  image:                     string   // full https:// URL
  price:                     number   // USD, must be in (0, 50_000]
  oldPrice?:                 number   // must be > price when set
  rating:                    number   // [0, 5]
  reviews:                   number   // >= 0
  badge?:                    string
  isTopSeller?:              boolean
  isOffer?:                  boolean  // if true, oldPrice must be set and > price
  description?:              string
  shipsToColombiaConfirmed?: boolean  // defaults to true in candidate-builder
}

/**
 * Per-category breakdown within a DiscoveryJob.
 * Records how many candidates were generated, deduplicated, and inserted
 * for each vacancy targeted in the run.
 */
export interface DiscoveryCategoryResult {
  category:    string
  vacancyId:   string   // "vac-{category}"
  slotsNeeded: number   // from vacancy at time of run
  generated:   number   // raw candidates produced for this category
  inserted:    number   // added to pool after deduplication
  duplicates:  number   // blocked by deduplicator
}

/**
 * A single execution of the Discovery Engine.
 * One DiscoveryJob covers all vacancies processed in that run.
 * Persisted in DiscoveryLogStore (append-only).
 */
export interface DiscoveryJob {
  id:                  string                    // "djob-{ISO-timestamp-slug}"
  runAt:               string                    // ISO 8601
  source:              DiscoverySource
  targetVacancyIds:    string[]                  // vacancy IDs targeted
  candidatesGenerated: number                    // total raw candidates from source
  candidatesInserted:  number                    // total added to pool (post-dedup)
  duplicatesSkipped:   number                    // total blocked by deduplicator
  byCategory:          DiscoveryCategoryResult[]
  durationMs:          number
  status:              DiscoveryJobStatus
  notes?:              string
}

/**
 * Returned by a single discovery run.
 * job      — the logged DiscoveryJob record
 * inserted — the CandidateRecords actually written to the pool
 * duplicates — ASINs blocked with their dedup reason
 */
export interface DiscoveryResult {
  job:        DiscoveryJob
  inserted:   CandidateRecord[]
  duplicates: Array<{ asin: string; reason: 'asin' | 'title'; detail: string }>
}

/**
 * Persisted store for discovery run history.
 * data/tpe/discovery-log.json
 * Append-only — jobs are never modified after writing.
 */
export interface DiscoveryLogStore {
  version:   number
  updatedAt: string        // ISO 8601
  jobs:      DiscoveryJob[] // append-only audit log
}
