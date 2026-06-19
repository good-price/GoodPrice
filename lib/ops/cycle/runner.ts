/**
 * lib/ops/cycle/runner.ts
 *
 * Master Cycle orchestrator for GOODPRICE OPS V3.
 *
 * runMasterCycle():
 *   1. Acquires cycle lock — rejects immediately if another cycle is running.
 *   2. Sets site mode to 'scheduled_maintenance' for the cycle duration.
 *   3. Sequences all stages defined in MASTER_CYCLE in definition order.
 *   4. Each stage is dispatched to its registered OpsWorker via executeStage().
 *   5. Stages are wrapped in runWithTimeout() — no stage can hang indefinitely.
 *   6. Required-stage failures abort the remaining pipeline.
 *   7. Accumulates catalog actions (removed/repaired/suppressed/recovered/flagged)
 *      from all stages into the consolidated cycle log.
 *   8. Restores site mode to 'public' and releases lock in the finally block.
 *
 * SERVER-ONLY.
 */

import { appendLog }                           from '../logs/writer'
import { logger }                              from '@/lib/ops/logger'
import { acquireCycleLock, releaseCycleLock }  from './lock'
import { setSiteMode }                         from '@/lib/system/site-mode'
import { getWorker }                           from '../workers/registry'
import { runWithTimeout }                      from '../workers/executor'
import { MASTER_CYCLE }                        from './definition'
import {
  writeCycleStart,
  writeCurrentStage,
  writeCycleEnd,
  updateJobState,
  flushSystemHealth,
}                                              from '../runtime/writer'
import type { CycleStage, CycleStageResult, CycleRunResult } from './types'
import type { OpsLog, OpsJobType, OpsLogStatus, OpsLogActions } from '../logs/types'

// ── ID generation ─────────────────────────────────────────────────────────────

function generatePipelineId(): string {
  const ts   = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `cycle-${ts}-${rand}`
}

function generateStageLogId(order: number): string {
  const ts   = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `stage-${order}-${ts}-${rand}`
}

function emptyActions(): OpsLogActions {
  return { removed: [], repaired: [], suppressed: [], recovered: [], flagged: [] }
}

// ── Stage executor ────────────────────────────────────────────────────────────

/**
 * Dispatches a cycle stage to its registered worker, enforces its timeout,
 * persists the stage's OpsLog entry, and returns a CycleStageResult.
 *
 * Never throws — all errors are captured and reflected in the result.
 */
async function executeStage(
  stage:      CycleStage,
  pipelineId: string,
): Promise<CycleStageResult> {
  const startedAt = new Date().toISOString()
  const startMs   = Date.now()

  writeCurrentStage(stage.jobType as OpsJobType, stage.order)
  logger.info('Cycle stage started', { pipelineId, stage: stage.order, jobType: stage.jobType })

  // ── Look up worker ────────────────────────────────────────────────────────

  const worker = getWorker(stage.jobType as OpsJobType)

  let stageStatus: OpsLogStatus = 'success'
  let stageSummary              = ''
  let stageActions              = emptyActions()
  let stageErrors:   string[]   = []
  let stageWarnings: string[]   = []

  if (!worker) {
    stageStatus  = 'failed'
    stageErrors  = [`No registered worker for job type: ${stage.jobType}`]
    stageSummary = `Stage ${stage.order}/${MASTER_CYCLE.stages.length} — ${stage.jobType}: no worker registered`

    logger.error('No worker registered for stage', { pipelineId, stage: stage.order, jobType: stage.jobType })
  } else {
    // ── Execute worker with timeout ─────────────────────────────────────────

    const outcome = await runWithTimeout(
      () => worker({ pipelineId, timeoutMs: stage.timeoutMs }),
      stage.timeoutMs,
    )

    if (outcome.ok) {
      const workerResult = outcome.value

      stageStatus   = workerResult.success ? 'success' : 'failed'
      stageSummary  = workerResult.summary
      stageActions  = {
        removed:    workerResult.actions.removed,
        repaired:   workerResult.actions.repaired,
        suppressed: workerResult.actions.suppressed,
        recovered:  workerResult.actions.recovered,
        flagged:    workerResult.actions.flagged,
      }
      stageErrors   = workerResult.errors
      stageWarnings = workerResult.warnings
    } else {
      stageStatus  = 'failed'
      stageErrors  = [outcome.error]
      stageSummary = `Stage ${stage.order}/${MASTER_CYCLE.stages.length} — ${stage.jobType}: ${
        'timedOut' in outcome && outcome.timedOut ? 'timed out' : 'error'
      }`

      if ('timedOut' in outcome && outcome.timedOut) {
        logger.warn('Cycle stage timed out', { pipelineId, stage: stage.order, jobType: stage.jobType, timeoutMs: stage.timeoutMs })
      } else {
        logger.error('Cycle stage failed', { pipelineId, stage: stage.order, jobType: stage.jobType, error: outcome.error })
      }
    }
  }

  const completedAt = new Date().toISOString()
  const durationMs  = Date.now() - startMs

  // ── Persist stage log ─────────────────────────────────────────────────────

  const stageLog: OpsLog = {
    id:          generateStageLogId(stage.order),
    jobType:     stage.jobType as OpsJobType,
    trigger:     'pipeline',
    pipelineId,
    startedAt,
    completedAt,
    durationMs,
    status:      stageStatus,
    summary:     stageSummary || `Stage ${stage.order}/${MASTER_CYCLE.stages.length} — ${stage.jobType} completed`,
    actions:     stageActions,
    errors:      stageErrors,
    warnings:    stageWarnings,
    notes:       '',
  }

  appendLog(stageLog)
  updateJobState(stage.jobType as OpsJobType, stageStatus, durationMs)

  logger.info('Cycle stage completed', { pipelineId, stage: stage.order, jobType: stage.jobType, status: stageStatus, durationMs })

  return {
    order:       stage.order,
    jobType:     stage.jobType as OpsJobType,
    status:      stageStatus,
    startedAt,
    completedAt,
    durationMs,
    errors:      stageErrors,
    warnings:    stageWarnings,
    actions:     stageActions,
  }
}

// ── Cycle orchestrator ────────────────────────────────────────────────────────

/**
 * Runs the Master Cycle.
 *
 * Guards: cycle lock prevents concurrent executions.
 * Site mode: set to 'scheduled_maintenance' for the duration, restored to 'public' in finally.
 * Stages: executed in definition order; required-stage failures abort remaining stages.
 * Consolidated cycle log: written last with accumulated actions from all stages.
 */
export async function runMasterCycle(): Promise<CycleRunResult> {
  const pipelineId    = generatePipelineId()
  const cycleStartMs  = Date.now()
  const cycleStartedAt = new Date().toISOString()

  // ── Acquire lock ──────────────────────────────────────────────────────────

  const lockAcquired = acquireCycleLock(pipelineId)

  if (!lockAcquired) {
    const completedAt = new Date().toISOString()
    const cancelMsg   = `Ciclo rechazado — lock activo. Otro ciclo ya está en ejecución.`

    logger.warn('Master cycle rejected — lock held', { pipelineId })
    writeCycleEnd(pipelineId, 'cancelled', completedAt, 0)
    flushSystemHealth('cancelled', null, [])

    const cancelLog: OpsLog = {
      id:          pipelineId,
      jobType:     'cycle-3am',
      trigger:     'scheduled',
      pipelineId,
      startedAt:   cycleStartedAt,
      completedAt,
      durationMs:  0,
      status:      'cancelled',
      summary:     cancelMsg,
      actions:     emptyActions(),
      errors:      [cancelMsg],
      warnings:    [],
      notes:       '',
    }
    appendLog(cancelLog)

    return {
      pipelineId,
      startedAt:        cycleStartedAt,
      completedAt,
      durationMs:       0,
      status:           'cancelled',
      stagesRun:        0,
      successfulStages: 0,
      failedStages:     0,
      stageResults:     [],
      errors:           [cancelMsg],
      summary:          cancelMsg,
    }
  }

  // ── Set site mode to scheduled_maintenance ────────────────────────────────

  try {
    const cycleEndEstimate = new Date(cycleStartMs + 30 * 60 * 1000).toISOString() // estimate: 30 min
    setSiteMode('scheduled_maintenance', cycleEndEstimate)
    logger.info('Site mode set to scheduled_maintenance', { pipelineId })
  } catch (err) {
    logger.warn('Failed to set site mode to scheduled_maintenance', {
      pipelineId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // ── Stage loop ────────────────────────────────────────────────────────────

  const stageResults: CycleStageResult[] = []
  const cycleErrors:  string[]            = []
  let   aborted = false

  writeCycleStart(pipelineId, cycleStartedAt)
  flushSystemHealth(null, pipelineId, [])

  logger.info('Master cycle started', {
    pipelineId,
    totalStages:  MASTER_CYCLE.stages.length,
    scheduleHour: MASTER_CYCLE.scheduleHour,
    timezone:     MASTER_CYCLE.timezone,
  })

  try {
    for (const stage of MASTER_CYCLE.stages) {
      if (aborted) break

      try {
        const result = await executeStage(stage, pipelineId)
        stageResults.push(result)

        if (result.status === 'failed' && stage.required) {
          const msg = `Required stage ${stage.order} (${stage.jobType}) failed — cycle aborted`
          logger.error('Required cycle stage failed', { pipelineId, stage: stage.order, jobType: stage.jobType })
          cycleErrors.push(msg)
          aborted = true
        }
      } catch (err) {
        // executeStage() should never throw, but guard defensively
        const errMsg = err instanceof Error ? err.message : String(err)
        const msg    = `Stage ${stage.order} (${stage.jobType}) threw unexpected exception: ${errMsg}`
        cycleErrors.push(msg)

        stageResults.push({
          order:       stage.order,
          jobType:     stage.jobType as OpsJobType,
          status:      'failed',
          startedAt:   new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs:  0,
          errors:      [errMsg],
          warnings:    [],
          actions:     emptyActions(),
        })

        if (stage.required) {
          logger.error('Required cycle stage threw unexpectedly — aborting', {
            pipelineId, stage: stage.order, jobType: stage.jobType, error: errMsg,
          })
          aborted = true
        } else {
          logger.warn('Optional cycle stage threw — continuing', {
            pipelineId, stage: stage.order, jobType: stage.jobType, error: errMsg,
          })
        }
      }
    }

    // ── Determine cycle status ────────────────────────────────────────────────

    const failedRequired = stageResults.some(
      s => s.status !== 'success' &&
           MASTER_CYCLE.stages.find(d => d.order === s.order)?.required === true,
    )
    const anyFailed = stageResults.some(s => s.status === 'failed')

    const status: OpsLogStatus =
      failedRequired ? 'failed'  :
      anyFailed      ? 'partial' :
      'success'

    const completedAt = new Date().toISOString()
    const durationMs  = Date.now() - cycleStartMs

    const ran       = stageResults.length
    const succeeded = stageResults.filter(s => s.status === 'success').length
    const failed    = stageResults.filter(s => s.status === 'failed').length

    const summary = [
      `Ciclo 3AM: ${ran}/${MASTER_CYCLE.stages.length} stages ejecutadas,`,
      `${succeeded} exitosas.`,
      aborted ? 'ABORTADO — stage requerida falló.' : '',
    ].join(' ').trim()

    // ── Accumulate actions from all stages ────────────────────────────────────

    const accumulatedActions: OpsLogActions = {
      removed:    stageResults.flatMap(s => s.actions.removed),
      repaired:   stageResults.flatMap(s => s.actions.repaired),
      suppressed: stageResults.flatMap(s => s.actions.suppressed),
      recovered:  stageResults.flatMap(s => s.actions.recovered),
      flagged:    stageResults.flatMap(s => s.actions.flagged),
    }

    // ── Persist consolidated cycle log ────────────────────────────────────────

    const cycleLog: OpsLog = {
      id:          pipelineId,
      jobType:     'cycle-3am',
      trigger:     'scheduled',
      pipelineId,
      startedAt:   cycleStartedAt,
      completedAt,
      durationMs,
      status,
      summary,
      actions:     accumulatedActions,
      errors:      cycleErrors,
      warnings:    [],
      notes:       '',
    }

    writeCycleEnd(pipelineId, status, completedAt, durationMs)
    flushSystemHealth(status, null, [])
    appendLog(cycleLog)

    logger.info('Master cycle completed', { pipelineId, status, durationMs, stagesRun: ran, stagesOk: succeeded })

    return {
      pipelineId,
      startedAt:        cycleStartedAt,
      completedAt,
      durationMs,
      status,
      stagesRun:        ran,
      successfulStages: succeeded,
      failedStages:     failed,
      stageResults,
      errors:           cycleErrors,
      summary,
    }
  } finally {
    // ── Restore site mode and release lock ────────────────────────────────────
    try {
      setSiteMode('public')
      logger.info('Site mode restored to public', { pipelineId })
    } catch (err) {
      logger.warn('Failed to restore site mode to public', {
        pipelineId,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    releaseCycleLock()
    logger.info('Cycle lock released', { pipelineId })
  }
}
