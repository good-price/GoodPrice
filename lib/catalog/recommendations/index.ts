/**
 * lib/catalog/recommendations/index.ts
 *
 * Barrel + runRecommendationScan() coordinator — Sprint 4F.
 *
 * runRecommendationScan():
 *   1. rebuildRecommendations() — full recompute
 *   2. getRecommendationGovernance() — aggregate
 *   3. Append OPS log (catalog-recommendations)
 *   4. Return result
 *
 * SERVER-ONLY.
 */

export type {
  ProductRecommendation,
  RecommendationStore,
  RecommendationGovernance,
} from './types'

export {
  readRecommendations,
  saveRecommendations,
  updateRecommendation,
  rebuildRecommendations,
} from './state'

export {
  computeRecommendationScore,
  buildRecommendationReasons,
} from './engine'
export type { RecommendationInput } from './engine'

export { getRecommendationGovernance } from './governance'

// ── Scan coordinator ──────────────────────────────────────────────────────────

import { rebuildRecommendations }          from './state'
import { getRecommendationGovernance }     from './governance'
import { appendLog }                       from '@/lib/ops/logs'
import type { OpsLog }                     from '@/lib/ops/logs/types'
import type { RecommendationGovernance }   from './types'

export interface RecommendationScanResult {
  productsProcessed: number
  governance:        RecommendationGovernance
}

export function runRecommendationScan(pipelineId?: string): RecommendationScanResult {
  const startMs   = Date.now()
  const startedAt = new Date().toISOString()

  const productsProcessed = rebuildRecommendations()
  const governance        = getRecommendationGovernance()
  const durationMs        = Date.now() - startMs
  const completedAt       = new Date().toISOString()

  const notes = [
    `total: ${governance.totalRecommendations}`,
    `excellent: ${governance.excellent}`,
    `good: ${governance.good}`,
    `average: ${governance.average}`,
    `weak: ${governance.weak}`,
    `avgScore: ${governance.averageScore}`,
    `durationMs: ${durationMs}`,
  ].join(' | ')

  const warnings: string[] = []
  const degradationPct = governance.totalRecommendations > 0
    ? (governance.weak / governance.totalRecommendations) * 100
    : 0
  if (degradationPct > 40) {
    warnings.push(`Recomendaciones degradadas: ${Math.round(degradationPct)}% son débiles`)
  }

  const log: OpsLog = {
    id:          pipelineId ?? `rec-scan-${Date.now()}`,
    jobType:     'catalog-recommendations',
    trigger:     'pipeline',
    pipelineId,
    startedAt,
    completedAt,
    durationMs,
    status:      warnings.length > 0 ? 'partial' : 'success',
    summary:     `Recommendations: ${productsProcessed} processed, ${governance.excellent} excellent, ${governance.good} good`,
    actions:     { removed: [], repaired: [], suppressed: [], recovered: [], flagged: [] },
    errors:      [],
    warnings,
    notes,
  }

  try {
    appendLog(log)
  } catch {
    // best-effort
  }

  return { productsProcessed, governance }
}
