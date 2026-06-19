/**
 * lib/ops/workers/worker-repair.ts
 *
 * Worker for the 'repair' cycle stage.
 *
 * Runs the catalog repair pipeline: finds products with broken images or invalid
 * metadata, applies auto-repairs where confidence >= threshold, and logs the rest
 * as manual review candidates.
 *
 * Cycle-context parameters:
 *   limit=20                 — max products to process per run
 *   confidenceThreshold=85   — minimum confidence for auto-applying a patch
 *
 * Corresponds to: POST /api/catalog/repair/run
 *
 * SERVER-ONLY.
 */

import { runCatalogRepair }             from '@/lib/catalog/repair'
import type { OpsWorker, OpsWorkerResult } from './types'

export const repairWorker: OpsWorker = async (): Promise<OpsWorkerResult> => {
  const result = await runCatalogRepair({
    limit:               20,
    dryRun:              false,
    confidenceThreshold: 85,
  })

  const repairedAsins = result.jobs
    .filter(j => j.status === 'auto_replaced')
    .map(j => j.asin)

  const flaggedAsins = result.jobs
    .filter(j => j.status === 'manual_review_required' || j.status === 'needs_paapi')
    .map(j => j.asin)

  const jobErrors = result.jobs
    .filter(j => j.error)
    .map(j => `${j.asin}: ${j.error}`)

  return {
    success: jobErrors.length === 0 || repairedAsins.length > 0,
    summary: [
      `Repair:`,
      `${result.processed} processed,`,
      `${result.autoRepaired} auto-repaired,`,
      `${result.manualReview} manual-review,`,
      `${result.noCandidate} no-candidate,`,
      `${result.needsPaapi} needs-paapi.`,
      `durationMs=${result.durationMs}.`,
    ].join(' '),
    actions: {
      removed:    [],
      repaired:   repairedAsins,
      suppressed: [],
      recovered:  [],
      flagged:    flaggedAsins,
    },
    warnings: result.needsPaapi > 0
      ? [`${result.needsPaapi} products need PA-API credentials to repair`]
      : [],
    errors: jobErrors,
  }
}
