/**
 * lib/catalog/stabilization/types.ts
 *
 * Types for the GOODPRICE catalog stabilization layer (Phase 34).
 *
 * The stabilization layer sits ABOVE the trust tier system — it analyzes
 * the health of the current tier distribution and generates recovery
 * actions without modifying any trust gate thresholds.
 */

// ── Visibility health ─────────────────────────────────────────────────────────

export type VisibilityHealthStatus =
  | 'healthy'       // ≥60% visible, distribution balanced
  | 'degraded'      // 30–59% visible, notable suppression pressure
  | 'critical'      // <30% visible, recovery needed urgently
  | 'over-suppressed' // <10% visible, something is misconfigured

export interface VisibilityRatios {
  total:          number
  visible:        number
  suppressed:     number
  active:         number
  warning:        number
  degraded:       number
  visiblePct:     number
  suppressedPct:  number
  activePct:      number
  warningPct:     number
  degradedPct:    number
}

// ── Suppression analysis ──────────────────────────────────────────────────────

export interface SuppressionBreakdown {
  reason:     string
  count:      number
  pct:        number
  recoverable: boolean
}

export interface SuppressionPressure {
  score:          number   // 0–100, higher = more pressure
  level:          'low' | 'moderate' | 'high' | 'critical'
  primaryGate:    string   // gate causing most suppressions
  breakdown:      SuppressionBreakdown[]
  recoverableCount: number
  hardSuppressed:   number
}

// ── Pricing health ─────────────────────────────────────────────────────────────

export interface PricingHealthReport {
  totalAnalyzed:    number
  staleCount:       number          // not validated in >7 days
  fakDiscountCount: number          // hasFakeDiscount = true
  driftedCount:     number          // price drifted >30% from catalog
  unreliableCount:  number          // stale OR fakeDiscount OR extreme drift
  stalePct:         number
  unreliablePct:    number
  avgTruthScore:    number
  needsRevalidation: string[]       // product IDs needing revalidation
}

// ── TRM (Tasa Representativa del Mercado) ─────────────────────────────────────

export interface TrmStatus {
  rate:           number            // USD→COP
  source:         string
  fetchedAt:      string | null
  expiresAt:      string | null
  ageHours:       number
  isStale:        boolean           // >25h since last fetch
  isFallback:     boolean
  freshnessLabel: 'fresh' | 'aging' | 'stale' | 'unknown'
}

// ── Catalog health score ──────────────────────────────────────────────────────

export interface CatalogHealthScore {
  overall:            number   // 0–100 composite
  visibilityHealth:   number   // % visible
  suppressionHealth:  number   // inverse of suppression pressure
  pricingHealth:      number   // inverse of unreliable pricing %
  linkHealth:         number   // % with alive links
  colombiaHealth:     number   // % confirmed shippable to Colombia
  trmHealth:          number   // freshness of exchange rate
  computedAt:         string
}

// ── Recovery priority ─────────────────────────────────────────────────────────

export type RecoveryPriority = 'immediate' | 'high' | 'medium' | 'low'

export interface RecoveryCandidate {
  productId:    string
  asin:         string
  currentTier:  string
  targetTier:   string
  priority:     RecoveryPriority
  reason:       string
  canRecoverWithoutPaapi: boolean
  engagementScore: number   // 0–100 based on click data
}

// ── Stabilization recommendations ─────────────────────────────────────────────

export type RecommendationType =
  | 'run-recovery-pipeline'
  | 'run-repair'
  | 'run-live-truth'
  | 'enable-paapi'
  | 'run-link-audit'
  | 'run-colombia-audit'
  | 'reduce-suppression-pressure'
  | 'revalidate-degraded'
  | 'update-trm'
  | 'revalidate-pricing'

export interface StabilizationRecommendation {
  type:        RecommendationType
  priority:    RecoveryPriority
  title:       string
  description: string
  /** API endpoint to execute this recommendation. */
  endpoint?:   string
  method?:     'POST' | 'GET'
  body?:       Record<string, unknown>
  impact:      string   // human description of expected improvement
}

// ── Full stabilization report ─────────────────────────────────────────────────

export interface StabilizationReport {
  computedAt:         string
  healthScore:        CatalogHealthScore
  visibilityStatus:   VisibilityHealthStatus
  ratios:             VisibilityRatios
  suppressionPressure: SuppressionPressure
  pricingHealth:      PricingHealthReport
  trmStatus:          TrmStatus
  recoveryCandidates: RecoveryCandidate[]
  recommendations:    StabilizationRecommendation[]
}
