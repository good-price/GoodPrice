/**
 * lib/catalog/runtime/execution-actions.ts
 *
 * Catalog Fill Execution Engine — Sprint 3E.
 *
 * Manages the lifecycle of a catalog-fill run:
 *   idle → calculating → completed
 *         ↓ (on error)
 *       failed
 *
 * Public API:
 *   saveCatalogExecution()  — atomic writer for execution state
 *   readCatalogExecution()  — fault-tolerant reader
 *   startCatalogFill()      — lock check + deficit selection + simulated run
 *   finishCatalogFill()     — explicit completion (for Sprint 3F async pipeline)
 *   failCatalogFill()       — explicit failure (for Sprint 3F async pipeline)
 *
 * Sprint 3E simulates the full pipeline synchronously:
 *   startCatalogFill() runs idle → calculating → completed in one call.
 *   finishCatalogFill() and failCatalogFill() are exposed for Sprint 3F
 *   when discovery introduces real async work between stages.
 *
 * Guarantees:
 *   - Atomic writes (tmp → rename, never partial JSON)
 *   - Lock: only one concurrent catalog-fill allowed (isRunning guard)
 *   - Fault-tolerant: all operations silently swallow errors
 *   - Never throws
 *
 * SERVER-ONLY.
 */

import path from 'path'

import { storage } from '@/lib/storage/StorageFactory'

import { appendLog }              from '@/lib/ops/logs'
import type { OpsLog }            from '@/lib/ops/logs'
import { readCatalogExecutionState } from './execution'
import type { CatalogExecutionState } from './execution'
import { computeCategoryDeficits } from './category-config'

// ── File path ─────────────────────────────────────────────────────────────────

const EXECUTION_FILE = path.resolve(
  process.cwd(),
  'data/catalog/catalog-execution.json',
)

// ── Return types ──────────────────────────────────────────────────────────────

export type CatalogFillStartResult =
  | { status: 'started';         pipelineId: string; category: string; deficit: number }
  | { status: 'already_running'; pipelineId: string | null }
  | { status: 'no_deficit' }
  | { status: 'error' }

export type CatalogFillFinishResult =
  | { status: 'completed'; admitted: number }
  | { status: 'not_running' }
  | { status: 'error' }

export type CatalogFillFailResult =
  | { status: 'failed' }
  | { status: 'not_running' }
  | { status: 'error' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultIdleState(): CatalogExecutionState {
  return {
    isRunning:        false,
    category:         null,
    stage:            'idle',
    deficit:          0,
    found:            0,
    validated:        0,
    admitted:         0,
    startedAt:        null,
    completedAt:      null,
    pipelineId:       null,
    currentBatch:     0,
    totalBatches:     1,
    currentCandidate: null,
    errors:           [],
    iterations:       0,
    remainingDeficit: 0,
    lastAdmittedAsin: null,
    currentCategory:      null,
    categoriesProcessed:  0,
    categoriesResolved:   0,
    refreshedPools:       [],
    warnings:             [],
  }
}

function generatePipelineId(): string {
  return `cf-${Date.now()}`
}

// ── Public: Writer ────────────────────────────────────────────────────────────

/**
 * Atomically persists the execution state to disk.
 * Follows the OPS V3 write pattern: writeFileSync(tmp) → renameSync(tmp → target).
 * Never throws.
 */
export function saveCatalogExecution(state: CatalogExecutionState): void {
  try {
    const tmp = EXECUTION_FILE + '.tmp'
    storage.write(tmp, JSON.stringify(state, null, 2))
    storage.rename(tmp, EXECUTION_FILE)
  } catch {
    // Intentionally swallowed — execution state writes are best-effort.
  }
}

// ── Public: Reader ────────────────────────────────────────────────────────────

/**
 * Reads the current catalog execution state.
 * Returns the idle default if the file is missing or corrupt.
 * Never throws.
 */
export function readCatalogExecution(): CatalogExecutionState {
  try {
    return readCatalogExecutionState()
  } catch {
    return defaultIdleState()
  }
}

// ── Public: Engine ────────────────────────────────────────────────────────────

/**
 * Starts a catalog fill run.
 *
 * Sprint 3E simulation:
 *   Runs the full pipeline synchronously (idle → calculating → completed)
 *   since there is no real discovery yet. When Sprint 3F adds discovery,
 *   this function will stop at `calculating` and wait for finishCatalogFill().
 *
 * Lock:
 *   If isRunning === true, returns { status: 'already_running' } immediately.
 *   No state mutation. No log entry.
 *
 * Returns:
 *   'started'         — pipeline ran to completion (simulated)
 *   'already_running' — lock held by previous run
 *   'no_deficit'      — all categories meet minimum; nothing to fill
 *   'error'           — unexpected error
 */
export function startCatalogFill(): CatalogFillStartResult {
  try {
    // ── Lock check (Part 3) ──────────────────────────────────────────────────
    const current = readCatalogExecution()
    if (current.isRunning) {
      return { status: 'already_running', pipelineId: current.pipelineId }
    }

    // ── Deficit selection (Part 4) ───────────────────────────────────────────
    const deficits  = computeCategoryDeficits()
    const topDeficit = deficits.find(d => d.deficit > 0)
    if (!topDeficit) {
      return { status: 'no_deficit' }
    }

    const pipelineId = generatePipelineId()
    const startedAt  = new Date().toISOString()

    // ── Stage: calculating (transition idle → calculating) ───────────────────
    saveCatalogExecution({
      isRunning:        true,
      category:         topDeficit.category,
      stage:            'calculating',
      deficit:          topDeficit.deficit,
      found:            0,
      validated:        0,
      admitted:         0,
      startedAt,
      completedAt:      null,
      pipelineId,
      currentBatch:     1,
      totalBatches:     1,
      currentCandidate: null,
      errors:           [],
      iterations:       0,
      remainingDeficit: topDeficit.deficit,
      lastAdmittedAsin: null,
      currentCategory:      null,
      categoriesProcessed:  0,
      categoriesResolved:   0,
      refreshedPools:       [],
      warnings:             [],
    })

    // ── [Sprint 3F hook: run discovery here] ─────────────────────────────────
    // When Sprint 3F implements discovery, the function will return here and
    // await results before calling finishCatalogFill(). For now, the pipeline
    // completes immediately (simulated run with found=0, admitted=0).

    // ── Stage: completed (transition calculating → completed) ────────────────
    const completedAt = new Date().toISOString()
    saveCatalogExecution({
      isRunning:        false,
      category:         topDeficit.category,
      stage:            'completed',
      deficit:          topDeficit.deficit,
      found:            0,
      validated:        0,
      admitted:         0,
      startedAt,
      completedAt,
      pipelineId,
      currentBatch:     1,
      totalBatches:     1,
      currentCandidate: null,
      errors:           [],
      iterations:       1,
      remainingDeficit: topDeficit.deficit,
      lastAdmittedAsin: null,
      currentCategory:      null,
      categoriesProcessed:  0,
      categoriesResolved:   0,
      refreshedPools:       [],
      warnings:             [],
    })

    // ── OPS log (Part 6) ─────────────────────────────────────────────────────
    const log: OpsLog = {
      id:          pipelineId,
      jobType:     'catalog-fill',
      trigger:     'manual',
      startedAt,
      completedAt,
      durationMs:  new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      status:      'success',
      summary:     'Ejecución de catálogo iniciada.',
      notes:       `category: ${topDeficit.category}, deficit: ${topDeficit.deficit}, pipeline: ${pipelineId}`,
      actions:     { removed: [], repaired: [], suppressed: [], recovered: [], flagged: [] },
      errors:      [],
      warnings:    [],
    }
    appendLog(log)

    return { status: 'started', pipelineId, category: topDeficit.category, deficit: topDeficit.deficit }

  } catch {
    return { status: 'error' }
  }
}

/**
 * Marks the current catalog fill run as completed.
 *
 * Intended for Sprint 3F when discovery results are known.
 * In Sprint 3E, startCatalogFill() completes the run synchronously,
 * but this function is provided for explicit completion control.
 *
 * Returns 'not_running' if no run is active.
 * Never throws.
 */
export function finishCatalogFill(admitted = 0): CatalogFillFinishResult {
  try {
    const current = readCatalogExecution()
    if (!current.isRunning) {
      return { status: 'not_running' }
    }

    saveCatalogExecution({
      ...current,
      isRunning:   false,
      stage:       'completed',
      admitted,
      completedAt: new Date().toISOString(),
    })

    return { status: 'completed', admitted }
  } catch {
    return { status: 'error' }
  }
}

/**
 * Marks the current catalog fill run as failed.
 *
 * Intended for Sprint 3F error handling.
 * Returns 'not_running' if no run is active.
 * Never throws.
 */
export function failCatalogFill(error?: string): CatalogFillFailResult {
  try {
    const current = readCatalogExecution()
    if (!current.isRunning) {
      return { status: 'not_running' }
    }

    saveCatalogExecution({
      ...current,
      isRunning:   false,
      stage:       'failed',
      completedAt: new Date().toISOString(),
    })

    // Log the failure
    if (current.pipelineId && current.startedAt) {
      const completedAt = new Date().toISOString()
      const failLog: OpsLog = {
        id:          `${current.pipelineId}-fail`,
        jobType:     'catalog-fill',
        trigger:     'manual',
        startedAt:   current.startedAt,
        completedAt,
        durationMs:  new Date(completedAt).getTime() - new Date(current.startedAt).getTime(),
        status:      'failed',
        summary:     'Ejecución de catálogo fallida.',
        notes:       error ?? '',
        actions:     { removed: [], repaired: [], suppressed: [], recovered: [], flagged: [] },
        errors:      error ? [error] : [],
        warnings:    [],
      }
      appendLog(failLog)
    }

    return { status: 'failed' }
  } catch {
    return { status: 'error' }
  }
}
