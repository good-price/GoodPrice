/**
 * lib/ops/runtime/writer.ts
 *
 * Atomic runtime state writers for GOODPRICE OPS V3.
 *
 * All writes:
 *   - Atomic: writeFileSync(tmp) + renameSync(tmp → target)
 *   - Fault-tolerant: never throw — any error is silently swallowed
 *   - Directory auto-created if missing
 *   - All fs operations synchronous
 *
 * SERVER-ONLY.
 */

import { storage }            from '@/lib/storage/StorageFactory'
import { dataPath }          from '@/lib/data-path'
import { readMasterCycleState, readJobStates, readSystemHealth } from './reader'
import type {
  MasterCycleState,
  JobRuntimeState,
  JobStatesFile,
  SystemHealth,
}                            from './types'
import type { OpsJobType, OpsLogStatus } from '../logs/types'

// ── File paths ────────────────────────────────────────────────────────────────

const CYCLE_STATE_FILE   = dataPath('data', 'ops', 'runtime', 'master-cycle-state.json')
const JOB_STATES_FILE    = dataPath('data', 'ops', 'runtime', 'job-states.json')
const SYSTEM_HEALTH_FILE = dataPath('data', 'ops', 'runtime', 'system-health.json')

// ── Internal helpers ──────────────────────────────────────────────────────────

function atomicWriteJSON(filePath: string, data: unknown): void {
  const tmp = filePath + '.tmp'
  storage.write(tmp, JSON.stringify(data, null, 2))
  storage.rename(tmp, filePath)
}

// ── Cycle state writers ───────────────────────────────────────────────────────

/**
 * Records that a new cycle has started.
 * Sets isRunning=true, clears currentStage/completedAt.
 * Never throws.
 */
export function writeCycleStart(pipelineId: string, startedAt: string): void {
  try {
    const prev = readMasterCycleState()
    const next: MasterCycleState = {
      ...prev,
      isRunning:    true,
      pipelineId,
      currentStage: null,
      currentOrder: null,
      startedAt,
      completedAt:  null,
    }
    atomicWriteJSON(CYCLE_STATE_FILE, next)
  } catch {
    // Intentionally swallowed — runtime state is best-effort
  }
}

/**
 * Updates the currently-executing stage so the Nerve Center can
 * show live progress.
 * Never throws.
 */
export function writeCurrentStage(jobType: OpsJobType, order: number): void {
  try {
    const prev = readMasterCycleState()
    const next: MasterCycleState = {
      ...prev,
      currentStage: jobType,
      currentOrder: order,
    }
    atomicWriteJSON(CYCLE_STATE_FILE, next)
  } catch {
    // Intentionally swallowed
  }
}

/**
 * Records cycle completion.
 *
 * If `pipelineId` matches the currently tracked cycle, clears live state
 * fields (isRunning → false, currentStage → null, etc.).
 *
 * If `pipelineId` does NOT match (e.g., a rejected/cancelled invocation),
 * only the cumulative counters are updated — the live state of the currently
 * running cycle is left untouched.
 *
 * Never throws.
 */
export function writeCycleEnd(
  pipelineId:  string,
  status:      OpsLogStatus,
  completedAt: string,
  durationMs:  number,
): void {
  try {
    const prev      = readMasterCycleState()
    const isCurrent = prev.pipelineId === pipelineId

    const next: MasterCycleState = {
      // Live state — only cleared when this pipeline is the active one
      isRunning:       isCurrent ? false           : prev.isRunning,
      pipelineId:      isCurrent ? null            : prev.pipelineId,
      currentStage:    isCurrent ? null            : prev.currentStage,
      currentOrder:    isCurrent ? null            : prev.currentOrder,
      startedAt:       isCurrent ? null            : prev.startedAt,
      completedAt:     isCurrent ? completedAt     : prev.completedAt,
      // Last-completed snapshot — always updated
      lastStartedAt:   isCurrent ? prev.startedAt  : prev.lastStartedAt,
      lastCompletedAt: completedAt,
      lastStatus:      status,
      lastDurationMs:  durationMs,
      // Cumulative counters — always incremented
      totalRuns:       prev.totalRuns + 1,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      successfulRuns:  prev.successfulRuns + (status === 'success'   ? 1 : 0),
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      partialRuns:     prev.partialRuns    + (status === 'partial'    ? 1 : 0),
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      failedRuns:      prev.failedRuns     + (status === 'failed'     ? 1 : 0),
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      cancelledRuns:   prev.cancelledRuns  + (status === 'cancelled'  ? 1 : 0),
    }
    atomicWriteJSON(CYCLE_STATE_FILE, next)
  } catch {
    // Intentionally swallowed
  }
}

// ── Job state writer ──────────────────────────────────────────────────────────

/**
 * Updates a single job's runtime stats after a stage completes.
 *
 * Uses Welford's online algorithm to maintain a rolling mean:
 *   newAvg = prevAvg + (newDuration - prevAvg) / newTotalRuns
 *
 * This avoids storing a history array — only the mean is kept.
 * Never throws.
 */
export function updateJobState(
  jobType:    OpsJobType,
  status:     OpsLogStatus,
  durationMs: number,
): void {
  try {
    const file   = readJobStates()
    const prev   = file.jobs[jobType]

    const prevTotal  = prev?.totalRuns         ?? 0
    const prevAvg    = prev?.averageDurationMs ?? 0
    const newTotal   = prevTotal + 1

    // Welford's online mean
    const newAvg = prevAvg + (durationMs - prevAvg) / newTotal

    const next: JobRuntimeState = {
      jobType,
      lastRunAt:         new Date().toISOString(),
      lastDurationMs:    durationMs,
      averageDurationMs: Math.round(newAvg),
      totalRuns:         newTotal,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      successfulRuns:    (prev?.successfulRuns ?? 0) + (status === 'success'   ? 1 : 0),
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      partialRuns:       (prev?.partialRuns    ?? 0) + (status === 'partial'    ? 1 : 0),
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      failedRuns:        (prev?.failedRuns     ?? 0) + (status === 'failed'     ? 1 : 0),
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      cancelledRuns:     (prev?.cancelledRuns  ?? 0) + (status === 'cancelled'  ? 1 : 0),
      lastStatus:        status,
    }

    const updatedFile: JobStatesFile = {
      updatedAt: new Date().toISOString(),
      jobs: { ...file.jobs, [jobType]: next },
    }
    atomicWriteJSON(JOB_STATES_FILE, updatedFile)
  } catch {
    // Intentionally swallowed
  }
}

// ── System health writer ──────────────────────────────────────────────────────

/**
 * Persists a SystemHealth snapshot.
 * Never throws.
 */
export function writeSystemHealth(health: SystemHealth): void {
  try {
    atomicWriteJSON(SYSTEM_HEALTH_FILE, health)
  } catch {
    // Intentionally swallowed
  }
}

// ── Computed health score ─────────────────────────────────────────────────────

/**
 * Computes a 0–100 health score from cycle status and per-job success rates.
 *
 * Base score from last cycle outcome:
 *   success   → 100
 *   partial   → 75
 *   failed    → 40
 *   cancelled → 90   (cancelled means locked-out, not broken)
 *   null      → 100  (no data yet)
 *
 * Per-job penalty: −5 for each job with successRate < 0.5 and totalRuns ≥ 3.
 * Score clamped to [0, 100].
 */
export function computeHealthScore(
  cycleStatus: OpsLogStatus | null,
  jobStates:   Partial<Record<OpsJobType, JobRuntimeState>>,
): number {
  const base =
    cycleStatus === 'success'   ? 100 :
    cycleStatus === 'partial'   ?  75 :
    cycleStatus === 'failed'    ?  40 :
    cycleStatus === 'cancelled' ?  90 :
    100

  let penalty = 0
  for (const job of Object.values(jobStates)) {
    if (!job || job.totalRuns < 3) continue
    const rate = job.totalRuns > 0 ? job.successfulRuns / job.totalRuns : 1
    if (rate < 0.5) penalty += 5
  }

  return Math.min(100, Math.max(0, base - penalty))
}

/**
 * Builds and persists a SystemHealth snapshot after a cycle completes.
 * Reads current cycle and job states, computes score, writes system-health.json.
 * Never throws.
 */
export function flushSystemHealth(
  cycleStatus:    OpsLogStatus | null,
  activePipeline: string | null,
  runningJobs:    OpsJobType[],
): void {
  try {
    const prev      = readSystemHealth()
    const jobStates = readJobStates()

    const health: SystemHealth = {
      healthScore:    computeHealthScore(cycleStatus, jobStates.jobs),
      activePipeline,
      runningJobs,
      lastUpdatedAt:  new Date().toISOString(),
    }

    // Preserve previous healthScore if we have no data yet and no previous score either
    if (health.healthScore === 100 && prev.healthScore !== 100 && cycleStatus === null) {
      health.healthScore = prev.healthScore
    }

    writeSystemHealth(health)
  } catch {
    // Intentionally swallowed
  }
}
