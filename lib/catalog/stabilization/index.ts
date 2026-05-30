/**
 * lib/catalog/stabilization/index.ts
 *
 * Public re-exports for the GOODPRICE catalog stabilization layer.
 */

// Types
export type {
  VisibilityHealthStatus,
  VisibilityRatios,
  SuppressionBreakdown,
  SuppressionPressure,
  PricingHealthReport,
  TrmStatus,
  CatalogHealthScore,
  RecoveryCandidate,
  RecoveryPriority,
  RecommendationType,
  StabilizationRecommendation,
  StabilizationReport,
} from './types'

// TRM engine
export {
  getTrmStatus,
  getTrmRate,
  isTrmFresh,
  convertUsdToCop,
  computeTrmHealth,
  TRM_FALLBACK_RATE,
} from './trm-engine'

// Visibility balancer
export {
  computeVisibilityRatios,
  classifyVisibilityHealth,
  computeVisibilityHealth,
} from './visibility-balancer'

// Suppression balancer
export {
  computeSuppressionPressure,
  computeSuppressionHealth,
} from './suppression-balancer'

// Degraded priority (recovery candidates)
export { buildPrioritizedRecoveryCandidates } from './degraded-priority'

// Public recovery recommendations
export {
  generateRecoveryRecommendations,
  buildRecoveryRecommendations,
} from './public-recovery'

// Stale pricing
export {
  buildPricingHealthReport,
  computePricingHealth,
} from './stale-pricing'

// Catalog health score
export { computeCatalogHealthScore } from './catalog-health'

// Execution analyzer
export {
  analyzeAndRecommend,
  getRecoverableSuppressionCount,
  getCatalogHealthLabel,
} from './execution-analyzer'

// Reports
export {
  buildStabilizationReport,
  saveStabilizationReport,
  loadStabilizationReport,
} from './reports'
