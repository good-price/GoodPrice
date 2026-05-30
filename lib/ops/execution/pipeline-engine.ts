/**
 * lib/ops/execution/pipeline-engine.ts
 *
 * Defines named multi-stage pipelines and runs them sequentially.
 *
 * A pipeline is a series of job types executed in order.
 * Each stage creates a new job, executes it, and proceeds only if it
 * succeeded (or if the stage is marked as optional).
 *
 * SERVER-ONLY.
 */

import type { ExecPipelineDef, ExecPipelineRun, ExecJobType } from './types'
import { createJob, updateJob, savePipelineRun, isJobCancelled } from './queue-engine'
import { acquireLock, releaseLock }                              from './mutex'
import { runJob }                                                from './job-runner'
import { appendToLog }                                           from './execution-log'

// ── Pipeline definitions ──────────────────────────────────────────────────────

/**
 * Full catalog recovery pipeline — the "Recover Catalog" one-click action.
 * Runs all validation/repair subsystems in the correct dependency order.
 */
export const RECOVERY_PIPELINE: ExecPipelineDef = {
  id:          'recovery',
  name:        'Recuperación de catálogo',
  description: 'Pipeline completo: trust → repair → live-truth → link-audit → colombia-audit → self-healing',
  stages:      ['trust-recompute', 'repair', 'live-truth', 'link-audit', 'colombia-audit', 'self-healing'],
}

/**
 * Quick validation pipeline — trust + self-healing only (faster, no HTTP audits).
 */
export const QUICK_PIPELINE: ExecPipelineDef = {
  id:          'quick-recovery',
  name:        'Recuperación rápida',
  description: 'Trust recompute + self-healing (sin auditorías de red)',
  stages:      ['trust-recompute', 'self-healing'],
}

/**
 * Audit pipeline — link + Colombia + trust (no repair, validates current state).
 */
export const AUDIT_PIPELINE: ExecPipelineDef = {
  id:          'audit',
  name:        'Auditoría de catálogo',
  description: 'Link audit + Colombia audit + trust recompute',
  stages:      ['link-audit', 'colombia-audit', 'trust-recompute'],
}

export const ALL_PIPELINES: ExecPipelineDef[] = [
  RECOVERY_PIPELINE,
  QUICK_PIPELINE,
  AUDIT_PIPELINE,
]

// ── Stage options per job type ────────────────────────────────────────────────

const DEFAULT_STAGE_OPTIONS: Partial<Record<ExecJobType, Record<string, unknown>>> = {
  'live-truth':     { limit: 10, delayMs: 2000 },
  'link-audit':     { maxProducts: 20 },
  'colombia-audit': { maxProducts: 20 },
  'self-healing':   { forceRun: true },
  'repair':         { limit: 20 },
}

// ── Pipeline runner ───────────────────────────────────────────────────────────

/**
 * Runs a pipeline definition sequentially.
 * Stops on any stage failure (hard stop, not optional continuation).
 */
export async function runPipeline(
  def:      ExecPipelineDef,
  options:  Record<string, unknown>,
  operator: string,
): Promise<ExecPipelineRun> {
  const pipelineId = `pipeline-${def.id}-${Date.now()}`

  const run: ExecPipelineRun = {
    id:           pipelineId,
    pipelineId:   def.id,
    name:         def.name,
    status:       'running',
    currentStage: 0,
    totalStages:  def.stages.length,
    jobIds:       [],
    startedAt:    new Date().toISOString(),
    completedAt:  null,
    operator,
  }

  savePipelineRun(run)

  try {
    for (let i = 0; i < def.stages.length; i++) {
      const stageType = def.stages[i]

      // Check if any job in this pipeline was cancelled
      const anyJobCancelled = run.jobIds.some(id => isJobCancelled(id))
      if (anyJobCancelled) {
        run.status       = 'cancelled'
        run.completedAt  = new Date().toISOString()
        run.currentStage = i
        savePipelineRun(run)
        return run
      }

      // Merge stage-specific defaults with caller options
      const stageOpts: Record<string, unknown> = {
        ...(DEFAULT_STAGE_OPTIONS[stageType] ?? {}),
        ...(options[stageType] && typeof options[stageType] === 'object'
          ? options[stageType] as Record<string, unknown>
          : {}),
      }

      // Acquire per-stage mutex
      if (!acquireLock(stageType, `${pipelineId}-stage-${i}`)) {
        // Another process holds the lock — skip this stage gracefully
        console.warn(`[pipeline] Skipping stage ${stageType} — lock held by another process`)
        continue
      }

      // Create and execute the stage job
      const job = createJob(stageType, stageOpts, operator)
      job.pipelineId    = pipelineId
      job.pipelineStage = i
      updateJob(job.id, { pipelineId, pipelineStage: i })

      run.jobIds.push(job.id)
      run.currentStage = i
      savePipelineRun(run)

      let stageOk = true
      try {
        const result = await runJob(job)
        appendToLog({ ...job, result, status: 'completed', completedAt: new Date().toISOString() })
      } catch (err) {
        stageOk = false
        console.error(`[pipeline] Stage ${stageType} failed:`, err)
        appendToLog({ ...job, status: 'failed', completedAt: new Date().toISOString(), error: String(err), result: null })
      } finally {
        releaseLock(stageType)
      }

      if (!stageOk) {
        run.status      = 'failed'
        run.completedAt = new Date().toISOString()
        savePipelineRun(run)
        return run
      }
    }

    run.status       = 'completed'
    run.currentStage = def.stages.length
    run.completedAt  = new Date().toISOString()
    savePipelineRun(run)
    return run
  } catch (err) {
    run.status      = 'failed'
    run.completedAt = new Date().toISOString()
    savePipelineRun(run)
    console.error('[pipeline] Unexpected pipeline error:', err)
    return run
  }
}
