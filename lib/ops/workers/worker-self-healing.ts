/**
 * lib/ops/workers/worker-self-healing.ts
 *
 * Worker for the 'self-healing' cycle stage.
 *
 * Runs the full self-healing pipeline:
 *   identify stale → archive → recover → drift-repair →
 *   replacement suggestions → promote recovered → refresh queue
 *
 * Corresponds to: POST /api/catalog/self-healing/run
 *
 * The worker bypasses the isCycleAllowed() rate-limit gate — rate limiting is
 * managed by the Master Cycle scheduler, not by the self-healing internal clock.
 *
 * SERVER-ONLY.
 */

import { runHealingCycle }              from '@/lib/catalog/self-healing'
import type { OpsWorker, OpsWorkerResult } from './types'

export const selfHealingWorker: OpsWorker = async (): Promise<OpsWorkerResult> => {
  const result = await runHealingCycle({
    // Cycle-context defaults: allow generous limits since we only run once daily.
    maxArchive:              10,
    maxRecover:              20,
    maxDriftRepairs:         20,
    minRecoveryScore:        60,
    archiveConsecutiveChecks: 2,
    archiveScoreThreshold:   30,
  })

  const errors: string[] = []
  if (!result.ok) {
    errors.push('runHealingCycle() reported ok=false')
  }

  const suppressedAsins = result.archived.map(e => e.asin)
  const recoveredAsins  = result.recovered.map(e => e.asin)
  const repairedAsins   = result.driftRepairs.map(e => e.asin)

  const parts = [
    `Self-healing:`,
    `${result.archived.length} suppressed,`,
    `${result.recovered.length} recovered,`,
    `${result.driftRepairs.length} drift-repaired,`,
    `${result.stale.length} stale flagged.`,
    `durationMs=${result.durationMs}.`,
  ]

  return {
    success: result.ok,
    summary: parts.join(' '),
    actions: {
      removed:    [],
      repaired:   repairedAsins,
      suppressed: suppressedAsins,
      recovered:  recoveredAsins,
      flagged:    result.stale.map(s => s.asin),
    },
    warnings: [],
    errors,
  }
}
