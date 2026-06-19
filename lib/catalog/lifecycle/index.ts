/**
 * lib/catalog/lifecycle/index.ts
 *
 * Catalog Lifecycle Engine — Sprint 4D.
 *
 * Barrel exports + runLifecycleScan() top-level coordinator.
 *
 * runLifecycleScan():
 *   1. Syncs lifecycle store from runtime catalog
 *   2. Computes governance stats
 *   3. Builds warnings for critical / low-confidence / stale products
 *   4. Appends OPS log with jobType: 'catalog-lifecycle'
 *   5. Updates lifecycle metrics
 *   Returns governance stats + warnings.
 *
 * SERVER-ONLY.
 */

// ── Re-exports ────────────────────────────────────────────────────────────────

export type { LifecycleHealth, ProductLifecycle, LifecycleStore, LifecycleMetricsFile } from './types'

export { computeLifecycleHealth }  from './health'
export type { HealthResult }       from './health'

export {
  readLifecycleStore,
  saveLifecycleStore,
  updateProductLifecycle,
  batchUpdateLifecycle,
  syncLifecycleFromRuntimeCatalog,
} from './state'

export { readLifecycleMetrics, saveLifecycleMetrics, updateLifecycleMetrics } from './metrics'

export type { LifecycleGovernance } from './governance'
export { getLifecycleGovernance }   from './governance'

export type { ReplacementCandidate }  from './replacements'
export { findReplacementCandidates, findAllReplacementCandidates } from './replacements'

// ── Lifecycle scanner ─────────────────────────────────────────────────────────

import { appendLog }                    from '@/lib/ops/logs'
import type { OpsLog }                  from '@/lib/ops/logs/types'
import { syncLifecycleFromRuntimeCatalog } from './state'
import { getLifecycleGovernance }       from './governance'
import { updateLifecycleMetrics }       from './metrics'
import { readLifecycleStore }           from './state'
import type { LifecycleGovernance }     from './governance'
import { rebuildRecommendations }       from '@/lib/catalog/recommendations/state'
import { generateAlerts }               from '@/lib/catalog/alerts/state'

export interface LifecycleScanResult {
  governance: LifecycleGovernance
  warnings:   string[]
  updated:    number
  durationMs: number
}

/**
 * Runs a full lifecycle scan:
 *   sync from runtime catalog → governance → OPS log → metrics.
 *
 * Returns the scan result. Never throws.
 */
export function runLifecycleScan(
  pipelineId?: string,
): LifecycleScanResult {
  const t0        = Date.now()
  const startedAt = new Date().toISOString()
  const id        = pipelineId ?? `lc-${t0}`

  let governance: LifecycleGovernance = {
    totalProducts: 0, healthy: 0, aging: 0, stale: 0, critical: 0,
    refreshNeeded: 0, replacementNeeded: 0, averageAgeDays: 0, averageConfidence: 0,
  }
  const warnings: string[] = []
  let updated = 0

  try {
    updated    = syncLifecycleFromRuntimeCatalog()
    governance = getLifecycleGovernance()

    // Build warnings
    if (governance.critical > 0) {
      warnings.push(`${governance.critical} producto${governance.critical > 1 ? 's' : ''} crítico${governance.critical > 1 ? 's' : ''} — requieren reemplazo`)
    }

    const store = readLifecycleStore()
    const lowConf = Object.values(store.products).filter(p => p.confidenceScore < 35).length
    if (lowConf > 0) {
      warnings.push(`${lowConf} producto${lowConf > 1 ? 's' : ''} con baja confianza (< 35)`)
    }

    const staleRatio = governance.totalProducts > 0
      ? (governance.stale + governance.critical) / governance.totalProducts
      : 0
    if (staleRatio > 0.3) {
      warnings.push(`Catálogo deteriorado: ${Math.round(staleRatio * 100)}% de productos stale o críticos`)
    }

  } catch {
    // best-effort — continue to logging
  }

  const durationMs  = Date.now() - t0
  const completedAt = new Date().toISOString()

  const notes = [
    `healthy: ${governance.healthy}`,
    `aging: ${governance.aging}`,
    `stale: ${governance.stale}`,
    `critical: ${governance.critical}`,
    `refreshNeeded: ${governance.refreshNeeded}`,
    `replacementNeeded: ${governance.replacementNeeded}`,
  ].join(' | ')

  const log: OpsLog = {
    id,
    jobType:     'catalog-lifecycle',
    trigger:     'pipeline',
    pipelineId,
    startedAt,
    completedAt,
    durationMs,
    status:      warnings.length === 0 ? 'success' : governance.critical > 0 ? 'partial' : 'success',
    summary:     `Lifecycle: ${governance.healthy} OK, ${governance.aging} aging, ${governance.stale} stale, ${governance.critical} critical`,
    actions:     { removed: [], repaired: [], suppressed: [], recovered: [], flagged: [] },
    errors:      [],
    warnings,
    notes,
  }

  appendLog(log)

  updateLifecycleMetrics({
    durationMs,
    updated,
    breakdown: {
      healthy:  governance.healthy,
      aging:    governance.aging,
      stale:    governance.stale,
      critical: governance.critical,
    },
  })

  // Sprint 4F: rebuild recommendations + alerts after lifecycle is updated
  try {
    rebuildRecommendations()
    generateAlerts()
  } catch {
    // best-effort — never block lifecycle scan
  }

  return { governance, warnings, updated, durationMs }
}
