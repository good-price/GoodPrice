/**
 * lib/ops/activation/reports.ts
 *
 * Assembles the full ActivationReport from all subsystems.
 * Called by the /api/ops/recovery/report endpoint.
 *
 * SERVER-ONLY.
 */

import { computeVisibilityAudit }          from './visibility-audit'
import { getTruthQueueStatus }             from './truth-queue'
import { getPaapiReadiness }               from './paapi-readiness'
import { getTrmMonitorStatus }             from './trm-monitor'
import { buildExecutionInsights }          from './execution-insights'
import { buildActivationRecommendations }  from './recommendations'
import { loadRecoveryRun, getLastCompletedRun } from './catalog-recovery'
import { computeRecoveryImpact }           from './recovery-metrics'
import type { ActivationReport, RecoveryImpact } from './types'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the full activation report (all subsystems).
 * Fast — reads from disk caches only, no network calls.
 */
export function buildActivationReport(): ActivationReport {
  const visibilityAudit = computeVisibilityAudit()
  const truthQueue      = getTruthQueueStatus()
  const paapiReadiness  = getPaapiReadiness()
  const trmStatus       = getTrmMonitorStatus()
  const insights        = buildExecutionInsights()
  const recommendations = buildActivationRecommendations(
    visibilityAudit, truthQueue, paapiReadiness, trmStatus, insights,
  )

  const currentRun       = loadRecoveryRun()
  const lastCompletedRun = getLastCompletedRun()

  // Compute impact only if there's a completed run with before/after data
  let impact: RecoveryImpact | null = null
  if (
    lastCompletedRun?.before &&
    lastCompletedRun?.after &&
    lastCompletedRun.status === 'completed'
  ) {
    impact = computeRecoveryImpact(
      lastCompletedRun.before,
      lastCompletedRun.after,
      lastCompletedRun.totalProductsRecovered,
      0,   // repaired count not tracked separately yet
      lastCompletedRun.status === 'completed' ? 100 : 0,
    )
  }

  return {
    generatedAt:      new Date().toISOString(),
    currentRun:       currentRun?.status === 'running' ? currentRun : null,
    lastCompletedRun: lastCompletedRun?.status === 'completed' ? lastCompletedRun : null,
    visibilityAudit,
    truthQueue,
    paapiReadiness,
    trmStatus,
    insights,
    recommendations,
    impact,
  }
}
