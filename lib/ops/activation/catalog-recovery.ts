/**
 * lib/ops/activation/catalog-recovery.ts
 *
 * Recovery state machine for the GOODPRICE OPS Recovery Center.
 *
 * Orchestrates the full catalog recovery pipeline:
 *   1. Captures "before" visibility snapshot
 *   2. Fires the existing RECOVERY_PIPELINE through pipeline-engine.ts
 *   3. Captures "after" visibility snapshot
 *   4. Persists run metadata to data/ops/activation/recovery.json
 *
 * The UI polls /api/ops/recovery/status to track progress.
 *
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dirname }        from 'path'
import { runPipeline, RECOVERY_PIPELINE } from '@/lib/ops/execution/pipeline-engine'
import { captureVisibilitySnapshot }       from './recovery-metrics'
import type { RecoveryRun, RecoveryStageInfo, RecoveryStage } from './types'
import { dataPath } from '@/lib/data-path'

// ── State persistence ─────────────────────────────────────────────────────────

const STATE_PATH = dataPath('data', 'ops', 'activation', 'recovery.json')

function ensureDir(): void {
  const dir = dirname(STATE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function loadRecoveryRun(): RecoveryRun | null {
  if (!existsSync(STATE_PATH)) return null
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as RecoveryRun
  } catch {
    return null
  }
}

export function saveRecoveryRun(run: RecoveryRun): void {
  ensureDir()
  const tmp = STATE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(run, null, 2), 'utf8')
  renameSync(tmp, STATE_PATH)
}

// ── Stage definitions (parallel to RECOVERY_PIPELINE.stages) ─────────────────

const STAGE_LABELS: Record<RecoveryStage, string> = {
  'trust-recompute': 'Trust Recompute',
  'repair':          'Image Repair',
  'live-truth':      'Live Truth',
  'link-audit':      'Link Audit',
  'colombia-audit':  'Colombia Audit',
  'self-healing':    'Self-Healing',
}

function makeInitialStages(): RecoveryStageInfo[] {
  return (RECOVERY_PIPELINE.stages as RecoveryStage[]).map(stage => ({
    stage,
    label:              STAGE_LABELS[stage] ?? stage,
    status:             'pending' as const,
    startedAt:          null,
    completedAt:        null,
    durationMs:         null,
    productsProcessed:  0,
    productsRecovered:  0,
    productsSuppressed: 0,
    summary:            null,
    error:              null,
  }))
}

// ── Recovery orchestrator ─────────────────────────────────────────────────────

/**
 * Initiates and runs the full catalog recovery pipeline.
 * Runs to completion (synchronous from caller's perspective — called from API route).
 *
 * Returns the completed RecoveryRun.
 */
export async function runCatalogRecovery(operator: string): Promise<RecoveryRun> {
  const id     = `recovery-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const stages = makeInitialStages()

  // Capture before snapshot
  const before = captureVisibilitySnapshot()

  // Create initial run record
  const run: RecoveryRun = {
    id,
    status:                 'running',
    operator,
    startedAt:              new Date().toISOString(),
    completedAt:            null,
    stages,
    before,
    after:                  null,
    pipelineRunId:          null,
    totalProductsProcessed: 0,
    totalProductsRecovered: 0,
    totalProductsSuppressed: 0,
    error:                  null,
  }

  saveRecoveryRun(run)

  try {
    // Mark first stage as running
    if (run.stages[0]) {
      run.stages[0].status    = 'running'
      run.stages[0].startedAt = new Date().toISOString()
      saveRecoveryRun(run)
    }

    // Execute the pipeline
    const pipelineRun = await runPipeline(RECOVERY_PIPELINE, { operator }, operator)

    run.pipelineRunId = pipelineRun.id

    // Map pipeline job results back to stage info
    // pipelineRun.jobIds is ordered by stage
    for (let i = 0; i < run.stages.length; i++) {
      const stage  = run.stages[i]
      const jobId  = pipelineRun.jobIds[i]

      if (!jobId) {
        stage.status = 'skipped'
        continue
      }

      // Determine stage status from pipeline outcome
      if (pipelineRun.status === 'completed') {
        stage.status = 'completed'
      } else if (i < pipelineRun.currentStage) {
        stage.status = 'completed'
      } else if (i === pipelineRun.currentStage) {
        stage.status = pipelineRun.status === 'failed' ? 'failed' : 'completed'
      } else {
        stage.status = pipelineRun.status === 'failed' ? 'skipped' : 'pending'
      }

      stage.completedAt = pipelineRun.completedAt ?? new Date().toISOString()
    }

    // Capture after snapshot
    const after = captureVisibilitySnapshot()
    run.after   = after

    // Aggregate totals from all stage progress data
    run.totalProductsProcessed  = after.total
    run.totalProductsRecovered  = Math.max(0, (after.active  + after.warning + after.degraded) - (before.active + before.warning + before.degraded))
    run.totalProductsSuppressed = Math.max(0, after.suppressed - before.suppressed)

    run.status       = pipelineRun.status === 'completed' ? 'completed' : 'failed'
    run.completedAt  = pipelineRun.completedAt ?? new Date().toISOString()
    run.error        = pipelineRun.status === 'failed' ? 'Un pipeline stage falló' : null

  } catch (err) {
    run.status      = 'failed'
    run.completedAt = new Date().toISOString()
    run.error       = err instanceof Error ? err.message : String(err)

    // Mark remaining pending stages as skipped
    for (const stage of run.stages) {
      if (stage.status === 'pending') stage.status = 'skipped'
      if (stage.status === 'running') stage.status = 'failed'
    }

    // Still capture after snapshot for comparison
    try {
      run.after = captureVisibilitySnapshot()
    } catch { /* ignore */ }
  }

  saveRecoveryRun(run)
  return run
}

// ── Status helpers ────────────────────────────────────────────────────────────

/**
 * Returns the last completed RecoveryRun (status = completed | failed).
 */
export function getLastCompletedRun(): RecoveryRun | null {
  const run = loadRecoveryRun()
  if (!run) return null
  return (run.status === 'completed' || run.status === 'failed') ? run : null
}

/**
 * Returns the currently running RecoveryRun, or null if idle.
 */
export function getActiveRecoveryRun(): RecoveryRun | null {
  const run = loadRecoveryRun()
  if (!run) return null
  return run.status === 'running' ? run : null
}
