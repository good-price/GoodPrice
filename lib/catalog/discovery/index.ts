/**
 * lib/catalog/discovery/index.ts
 *
 * Barrel exports for the Catalog Discovery Pipeline (Sprint 3F / 3H).
 *
 * Existing files (best-sellers scraper system) are NOT re-exported here —
 * consumers import from their specific modules (run-discovery.ts, etc.).
 */

export type {
  CatalogCandidate,
  CatalogCandidateSource,
  DiscoveryContext,
  DiscoveryResult,
} from './types'

export { searchCatalogCandidates }   from './search'
export { rankCatalogCandidates }     from './ranking'
export { validateCatalogCandidates } from './validation'
export { runCatalogDiscovery }       from './runner'

// Sprint 3H: pool health + refresh
export type { CandidatePoolStats }   from './pool-health'
export {
  LOW_THRESHOLD,
  getCandidatePoolStats,
  isCategoryPoolEmpty,
  isCategoryPoolLow,
  needsPoolRefresh,
} from './pool-health'

export { refreshCandidatePool, refreshCategoryPool } from './refresh'

// Sprint 4B: discovery state + enrichment
export type { DiscoveryCategoryState, DiscoveryStateFile } from './state'
export { readDiscoveryState, saveDiscoveryState, updateDiscoveryCategoryState } from './state'
export { enrichCandidate, enrichCandidates } from './enrichment'

// Sprint 4C: metrics, intelligence, governance
export type { CategoryDiscoveryMetrics, DiscoveryMetricsFile } from './metrics'
export { readDiscoveryMetrics, saveDiscoveryMetrics, updateDiscoveryMetrics } from './metrics'
export { computeQualityScore, computeConfidenceScore } from './intelligence'
export type { PoolGovernance } from './governance'
export { getPoolGovernance } from './governance'
