/**
 * lib/catalog/trust/index.ts
 *
 * Public re-exports for the GOODPRICE trust & visibility system.
 */

// Types
export type {
  VisibilityTier,
  TierSeverity,
  ConfidenceLevel,
  BadgeCode,
  WarningBadge,
  VisibilitySignal,
  VisibilityResult,
  VisibilityContext,
  HealingEntry,
  TrustReport,
  RecoveryCandidate,
} from './types'

// Visibility engine — main API
export {
  computeProductVisibility,
  computeCatalogVisibility,
  buildVisibilityContext,
  invalidateVisibilityContext,
  isProductPublic,
  getProductTier,
} from './visibility-engine'

// Trust engine
export { computeProductTier } from './trust-engine'

// Suppression engine
export {
  evaluateSuppressionSignals,
  CRITICAL_AUDIT_SCORE,
  DEAD_LINK_SUPPRESS_CONSECUTIVE,
  HEALING_EXTEND_SUPPRESS_DAYS,
} from './suppression-engine'

// Degradation engine
export {
  evaluateDegradationSignals,
  WARN_AUDIT_SCORE,
} from './degradation-engine'

// Confidence engine
export { computeConfidence } from './confidence-engine'

// Warning badges
export {
  generateWarningBadges,
  getBadge,
} from './warning-badges'

// Public score
export { computePublicScore } from './public-score'

// Recovery engine
export { findRecoveryCandidates } from './recovery-engine'

// Reports
export {
  buildTrustReport,
  loadTrustReport,
  saveTrustReport,
} from './reports'
