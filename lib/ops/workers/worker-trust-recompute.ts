/**
 * lib/ops/workers/worker-trust-recompute.ts
 *
 * Worker for the 'trust-recompute' cycle stage.
 *
 * Invalidates the in-memory visibility context cache, then rebuilds and
 * persists the catalog-wide TrustReport from the current catalog state.
 * Pure in-memory computation — no network calls.
 *
 * Corresponds to: POST /api/catalog/trust/recompute
 *
 * SERVER-ONLY.
 */

import { buildTrustReport, saveTrustReport } from '@/lib/catalog/trust/reports'
import { invalidateVisibilityContext }         from '@/lib/catalog/trust/visibility-engine'
import type { OpsWorker, OpsWorkerResult }     from './types'

export const trustRecomputeWorker: OpsWorker = async (): Promise<OpsWorkerResult> => {
  // Invalidate cached context so recompute sees fresh quarantine / audit data.
  invalidateVisibilityContext()

  const report = buildTrustReport()
  saveTrustReport(report)

  return {
    success: true,
    summary: [
      `Trust recomputed:`,
      `${report.active} active,`,
      `${report.warning} warning,`,
      `${report.degraded} degraded,`,
      `${report.suppressed} suppressed.`,
      `avgScore=${report.avgPublicScore}.`,
      `recoveryCandidates=${report.recoveryCandidates}.`,
    ].join(' '),
    actions: {
      removed:    [],
      repaired:   [],
      suppressed: [],
      recovered:  [],
      flagged:    [],
    },
    warnings: [],
    errors:   [],
  }
}
