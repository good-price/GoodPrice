/**
 * lib/catalog/intelligence/index.ts
 *
 * Public API for the GOODPRICE Catalog Intelligence System.
 *
 * Usage:
 *   import { generateIntelligenceReport } from '@/lib/catalog/intelligence'
 *
 * The intelligence system requires analytics data (async) but all other
 * computations (health, lifecycle, trends) are synchronous once data is loaded.
 *
 * Architecture summary:
 *   product-health    → 0-100 health score per product
 *   engagement-score  → normalised engagement from click analytics
 *   product-lifecycle → state machine: new → healthy → trending → ... → archived
 *   category-health   → per-category aggregates
 *   trend-engine      → rising / falling / dead signals
 *   suppression-engine → products that should be hidden
 *   promotion-engine  → products that should be featured
 *   ranking-engine    → category sort order by composite score
 *   discovery-engine  → suggestions for new products to source
 *   recommendations   → related product suggestions
 *   reports           → full IntelligenceReport orchestrator
 */

// ── Types ──────────────────────────────────────────────────────────────────────
export type {
  ProductLifecycleState,
  HealthScoreBreakdown,
  ProductHealthScore,
  EngagementScore,
  CategoryHealth,
  TrendEntry,
  TrendData,
  SuppressionCandidate,
  PromotionCandidate,
  RankedProduct,
  DiscoverySuggestion,
  RelatedProduct,
  IntelligenceContext,
  IntelligenceReport,
} from './types'

// ── Main report (async) ────────────────────────────────────────────────────────
export {
  generateIntelligenceReport,
} from './reports'
export type { GenerateIntelligenceReportOptions } from './reports'

// ── Individual engines (synchronous, accept pre-fetched data) ─────────────────
export {
  computeProductHealth,
  computeAllHealthScores,
  computeEngagementScoreFromRank,
} from './product-health'

export {
  computeAllEngagementScores,
  buildEngagementMap,
} from './engagement-score'

export {
  determineLifecycleState,
  computeAllLifecycleStates,
  countByLifecycle,
} from './product-lifecycle'

export {
  computeAllCategoryHealth,
} from './category-health'

export {
  computeTrends,
} from './trend-engine'

export {
  computeSuppressionQueue,
} from './suppression-engine'

export {
  computePromotionQueue,
} from './promotion-engine'

export {
  computeCategoryRankings,
  getCategoryRankedProducts,
  computeRankScore,
} from './ranking-engine'

export {
  generateDiscoverySuggestions,
} from './discovery-engine'

export {
  getRelatedProducts,
  getTopRelatedByCategory,
} from './recommendations'

// ── Snapshot (sync bridge for ISR pages) ──────────────────────────────────────
export type { IntelligenceSnapshot } from './snapshot'
export {
  loadIntelligenceSnapshot,
  saveIntelligenceSnapshot,
  buildSnapshot,
  getCachedSnapshot,
  getSnapshotRelatedProducts,
} from './snapshot'
