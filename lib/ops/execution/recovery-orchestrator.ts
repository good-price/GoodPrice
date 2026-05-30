/**
 * lib/ops/execution/recovery-orchestrator.ts
 *
 * "Recover Catalog" — one-click full catalog recovery orchestration.
 *
 * This is the highest-level entry point for the operational execution layer.
 * It runs the full recovery pipeline and returns a summary of what happened.
 *
 * SERVER-ONLY.
 */

import type { ExecPipelineRun }              from './types'
import { RECOVERY_PIPELINE, QUICK_PIPELINE } from './pipeline-engine'
import { runPipeline }                        from './pipeline-engine'
import { isLocked }                           from './mutex'

// ── Recovery options ──────────────────────────────────────────────────────────

export interface RecoveryOptions {
  /** Use quick pipeline (trust + self-healing only). Default: false. */
  quick?: boolean
  /** Per-stage option overrides. */
  stageOptions?: Record<string, Record<string, unknown>>
  /** Operator identifier. */
  operator?: string
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs the full catalog recovery pipeline.
 *
 * Returns as soon as the pipeline completes (or fails/cancels).
 * Progress is tracked in the job store and can be polled via GET /api/ops/jobs.
 */
export async function runRecoveryPipeline(
  options: RecoveryOptions = {},
): Promise<ExecPipelineRun> {
  const operator = options.operator ?? 'ops-system'
  const def      = options.quick ? QUICK_PIPELINE : RECOVERY_PIPELINE

  // Check if a recovery pipeline is already running
  const blockedStages = def.stages.filter(s => isLocked(s))
  if (blockedStages.length > 0) {
    console.warn(`[recovery-orchestrator] Stages locked: ${blockedStages.join(', ')} — pipeline may wait or skip locked stages`)
  }

  return runPipeline(def, options.stageOptions ?? {}, operator)
}

/**
 * Checks whether any recovery stage is currently locked (running).
 * Use this to show a "pipeline busy" state in the UI.
 */
export function isRecoveryRunning(): boolean {
  return RECOVERY_PIPELINE.stages.some(s => isLocked(s))
}

/**
 * Returns a human-readable status summary for the recovery system.
 */
export function getRecoveryStatus(): {
  isRunning:     boolean
  lockedStages:  string[]
  message:       string
} {
  const locked = RECOVERY_PIPELINE.stages.filter(s => isLocked(s))
  const isRunning = locked.length > 0

  return {
    isRunning,
    lockedStages: locked,
    message: isRunning
      ? `Pipeline en ejecución — etapas activas: ${locked.join(', ')}`
      : 'Sistema listo para ejecutar un pipeline de recuperación',
  }
}
