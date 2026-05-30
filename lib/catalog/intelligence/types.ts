/**
 * lib/catalog/intelligence/types.ts
 *
 * All types for the GOODPRICE Catalog Intelligence System.
 *
 * The intelligence system sits on top of the existing audit, repair, and
 * analytics layers to produce a unified view of catalog health and
 * recommend autonomous actions.
 */

// ── Product lifecycle ──────────────────────────────────────────────────────────

/**
 * Every product has exactly one lifecycle state at any moment.
 *
 *  new         → recently validated, no engagement data yet
 *  healthy     → good health score + active engagement
 *  trending    → rising engagement, high click share
 *  stable      → moderate health + consistent engagement
 *  declining   → health or engagement falling below expectations
 *  stale       → valid product but no engagement in a long time
 *  unhealthy   → health score below threshold (broken image, bad ASIN, etc.)
 *  quarantined → in the audit quarantine list
 *  archived    → effectively dead (inactive + no engagement)
 */
export type ProductLifecycleState =
  | 'new'
  | 'healthy'
  | 'trending'
  | 'stable'
  | 'declining'
  | 'stale'
  | 'unhealthy'
  | 'quarantined'
  | 'archived'

// ── Health score ───────────────────────────────────────────────────────────────

export interface HealthScoreBreakdown {
  /** 0-25: scaled from audit reliability score (or 12 if no audit) */
  auditScore: number
  /** 0-20: m.media CDN = 20, images-na/I = 10, P/ or invalid = 0 */
  imageScore: number
  /** 0-15: valid ASIN + active status = 15, degrades by status */
  asinScore: number
  /** 0-15: recency of lastValidated field */
  freshnessScore: number
  /** 0-15: click percentile within catalog */
  engagementScore: number
  /** 0-10: 10 = no repair issues, penalised for failures */
  repairScore: number
}

export interface ProductHealthScore {
  productId: string
  asin: string
  title: string
  category: string
  /** Total 0–100 */
  total: number
  breakdown: HealthScoreBreakdown
}

// ── Engagement score ───────────────────────────────────────────────────────────

export interface EngagementScore {
  productId: string
  /** Raw click count from analytics */
  totalClicks: number
  /** Percentage of all product clicks (e.g. 3.5) */
  clickSharePct: number
  /** Rank within category (1 = most clicked) */
  categoryRank: number
  /** Rank across entire catalog */
  globalRank: number
  /** Normalised 0–100 engagement signal */
  score: number
  /** Direction based on click share vs category average */
  trend: 'rising' | 'stable' | 'falling' | 'dead'
}

// ── Category health ────────────────────────────────────────────────────────────

export interface CategoryHealth {
  slug: string
  name: string
  totalProducts: number
  /** Products currently in 'healthy' or 'trending' lifecycle */
  healthyCount: number
  /** Products in 'unhealthy', 'declining', or 'archived' lifecycle */
  atRiskCount: number
  /** Mean health score across all products in category */
  avgHealthScore: number
  /** Total engagement clicks for category */
  totalClicks: number
  /** Category engagement trend */
  trend: 'rising' | 'stable' | 'falling'
  /** Product ID of the top performer in this category */
  topProductId: string | null
}

// ── Trend data ─────────────────────────────────────────────────────────────────

export interface TrendEntry {
  productId: string
  title: string
  category: string
  score: number
}

export interface TrendData {
  /** Products with high engagement + healthy state */
  rising: TrendEntry[]
  /** Products with declining engagement or health */
  falling: TrendEntry[]
  /** Products with zero engagement + degraded health */
  dead: TrendEntry[]
  /** Categories with above-median total engagement */
  risingCategories: string[]
  /** Categories with below-median total engagement */
  fallingCategories: string[]
}

// ── Suppression & promotion queues ────────────────────────────────────────────

export interface SuppressionCandidate {
  productId: string
  asin: string
  title: string
  category: string
  /** Short human-readable reason */
  reason: string
  healthScore: number
  lifecycleState: ProductLifecycleState
  /** How urgent this suppression is */
  severity: 'critical' | 'high' | 'medium'
}

export interface PromotionCandidate {
  productId: string
  asin: string
  title: string
  category: string
  reason: string
  healthScore: number
  engagementScore: number
  lifecycleState: ProductLifecycleState
}

// ── Ranking ────────────────────────────────────────────────────────────────────

export interface RankedProduct {
  productId: string
  /** Composite 0–1 ranking score */
  rankScore: number
  /** Resolved position (1 = best) */
  position: number
}

// ── Discovery suggestions ──────────────────────────────────────────────────────

export interface DiscoverySuggestion {
  /** The brand/keyword to search for */
  suggestedQuery: string
  category: string
  /** Why this suggestion was generated */
  rationale: string
  /** Product that inspired this (high performer) */
  sourceProductId: string
  /** Brand that inspired this */
  brand: string
  /** Estimated potential: 'high' if top-performing brand */
  potential: 'high' | 'medium' | 'low'
}

// ── Recommendations ────────────────────────────────────────────────────────────

export interface RelatedProduct {
  productId: string
  title: string
  asin: string
  similarity: 'same_brand' | 'same_category' | 'similar_price'
}

// ── Intelligence context (shared input) ───────────────────────────────────────

/**
 * Pre-computed data passed into the intelligence engine to avoid
 * re-fetching from multiple sources.
 */
export interface IntelligenceContext {
  /** Analytics metrics per product (from buildCatalogMetrics) */
  productMetrics: import('@/lib/analytics/metrics').ProductMetric[]
  /** Category metrics aggregate (from buildCatalogMetrics) */
  categoryMetrics: Record<string, import('@/lib/analytics/metrics').CategoryMetric>
}

// ── Full intelligence report ───────────────────────────────────────────────────

export interface IntelligenceReport {
  generatedAt: string
  durationMs: number
  totalProducts: number

  /** Health score per product (sorted by score desc) */
  healthScores: ProductHealthScore[]

  /** Lifecycle state per productId */
  lifecycleStates: Record<string, ProductLifecycleState>

  /** Engagement data per product */
  engagementScores: EngagementScore[]

  /** Per-category health summary */
  categoryHealth: CategoryHealth[]

  /** Trend signals */
  trends: TrendData

  /** Products that should be suppressed */
  suppressionQueue: SuppressionCandidate[]

  /** Products that should be promoted / featured */
  promotionQueue: PromotionCandidate[]

  /** Ranked product IDs per category */
  categoryRankings: Record<string, string[]>

  /** Suggested new products to discover */
  discoverySuggestions: DiscoverySuggestion[]

  // ── Admin shortcuts ──────────────────────────────────────────────────────────

  /** Top 10 healthiest products */
  topHealthy: ProductHealthScore[]

  /** Products at immediate risk */
  atRisk: Array<ProductHealthScore & { reason: string }>

  /** Products with best engagement momentum */
  topEngaged: EngagementScore[]
}
