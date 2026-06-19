/**
 * lib/ops/runtime/metrics.ts
 *
 * Runtime metrics engine for GOODPRICE OPS V3.
 *
 * All metrics are derived from job-states.json and master-cycle-state.json —
 * NO log scanning, NO history arrays. Reads are fast and O(1).
 *
 * SERVER-ONLY.
 */

import { readJobState, readMasterCycleState } from './reader'
import type { OpsJobType }                    from '../logs/types'

// ── Per-job metrics ───────────────────────────────────────────────────────────

/**
 * Returns the rolling average duration (ms) for a job type.
 * Returns 0 if the job has never run.
 */
export function getAverageDuration(jobType: OpsJobType): number {
  const state = readJobState(jobType)
  return state?.averageDurationMs ?? 0
}

/**
 * Returns successfulRuns / totalRuns for a job type.
 * Returns 1 (100%) if the job has never run.
 */
export function getJobSuccessRate(jobType: OpsJobType): number {
  const state = readJobState(jobType)
  if (!state || state.totalRuns === 0) return 1
  return state.successfulRuns / state.totalRuns
}

/**
 * Returns failedRuns / totalRuns for a job type.
 * Returns 0 if the job has never run.
 */
export function getFailureRate(jobType: OpsJobType): number {
  const state = readJobState(jobType)
  if (!state || state.totalRuns === 0) return 0
  return state.failedRuns / state.totalRuns
}

// ── Cycle metrics ─────────────────────────────────────────────────────────────

/**
 * Returns successfulRuns / totalRuns across all cycle invocations.
 * Reads from master-cycle-state.json (no log scanning).
 * Returns 1 (100%) if no cycles have run yet.
 */
export function getCycleSuccessRate(): number {
  const state = readMasterCycleState()
  if (state.totalRuns === 0) return 1
  return state.successfulRuns / state.totalRuns
}
