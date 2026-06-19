/**
 * lib/ops/runtime/reader.ts
 *
 * Fault-tolerant readers for runtime state files.
 *
 * All functions:
 *   - Return empty/default state on missing or corrupt files
 *   - Never throw
 *   - All fs operations synchronous
 *
 * SERVER-ONLY.
 */

import { storage }                  from '@/lib/storage/StorageFactory'
import { dataPath }                 from '@/lib/data-path'
import type {
  MasterCycleState,
  JobRuntimeState,
  JobStatesFile,
  SystemHealth,
}                                   from './types'
import type { OpsJobType }          from '../logs/types'

// ── File paths ────────────────────────────────────────────────────────────────

const CYCLE_STATE_FILE   = dataPath('data', 'ops', 'runtime', 'master-cycle-state.json')
const JOB_STATES_FILE    = dataPath('data', 'ops', 'runtime', 'job-states.json')
const SYSTEM_HEALTH_FILE = dataPath('data', 'ops', 'runtime', 'system-health.json')

// ── Default states ────────────────────────────────────────────────────────────

function defaultCycleState(): MasterCycleState {
  return {
    isRunning:       false,
    pipelineId:      null,
    currentStage:    null,
    currentOrder:    null,
    startedAt:       null,
    completedAt:     null,
    lastStartedAt:   null,
    lastCompletedAt: null,
    lastStatus:      null,
    lastDurationMs:  0,
    totalRuns:       0,
    successfulRuns:  0,
    partialRuns:     0,
    failedRuns:      0,
    cancelledRuns:   0,
  }
}

function defaultJobStatesFile(): JobStatesFile {
  return { updatedAt: new Date().toISOString(), jobs: {} }
}

function defaultSystemHealth(): SystemHealth {
  return {
    healthScore:    100,
    activePipeline: null,
    runningJobs:    [],
    lastUpdatedAt:  new Date().toISOString(),
  }
}

// ── Migration helpers ─────────────────────────────────────────────────────────

function migrateCycleState(raw: Record<string, unknown>): MasterCycleState {
  const defaults = defaultCycleState()
  return {
    isRunning:       typeof raw.isRunning       === 'boolean' ? raw.isRunning       : defaults.isRunning,
    pipelineId:      typeof raw.pipelineId      === 'string'  ? raw.pipelineId      : defaults.pipelineId,
    currentStage:    typeof raw.currentStage    === 'string'  ? raw.currentStage    : defaults.currentStage,
    currentOrder:    typeof raw.currentOrder    === 'number'  ? raw.currentOrder    : defaults.currentOrder,
    startedAt:       typeof raw.startedAt       === 'string'  ? raw.startedAt       : defaults.startedAt,
    completedAt:     typeof raw.completedAt     === 'string'  ? raw.completedAt     : defaults.completedAt,
    lastStartedAt:   typeof raw.lastStartedAt   === 'string'  ? raw.lastStartedAt   : defaults.lastStartedAt,
    lastCompletedAt: typeof raw.lastCompletedAt === 'string'  ? raw.lastCompletedAt : defaults.lastCompletedAt,
    lastStatus:      typeof raw.lastStatus      === 'string'  ? raw.lastStatus as MasterCycleState['lastStatus'] : defaults.lastStatus,
    lastDurationMs:  typeof raw.lastDurationMs  === 'number'  ? raw.lastDurationMs  : defaults.lastDurationMs,
    totalRuns:       typeof raw.totalRuns       === 'number'  ? raw.totalRuns       : defaults.totalRuns,
    successfulRuns:  typeof raw.successfulRuns  === 'number'  ? raw.successfulRuns  : defaults.successfulRuns,
    partialRuns:     typeof raw.partialRuns     === 'number'  ? raw.partialRuns     : defaults.partialRuns,
    failedRuns:      typeof raw.failedRuns      === 'number'  ? raw.failedRuns      : defaults.failedRuns,
    cancelledRuns:   typeof raw.cancelledRuns   === 'number'  ? raw.cancelledRuns   : defaults.cancelledRuns,
  }
}

function migrateJobState(raw: Record<string, unknown>): JobRuntimeState {
  return {
    jobType:           (raw.jobType as OpsJobType) ?? 'trust-recompute',
    lastRunAt:         typeof raw.lastRunAt         === 'string' ? raw.lastRunAt         : null,
    lastDurationMs:    typeof raw.lastDurationMs    === 'number' ? raw.lastDurationMs    : 0,
    averageDurationMs: typeof raw.averageDurationMs === 'number' ? raw.averageDurationMs : 0,
    totalRuns:         typeof raw.totalRuns         === 'number' ? raw.totalRuns         : 0,
    successfulRuns:    typeof raw.successfulRuns    === 'number' ? raw.successfulRuns    : 0,
    partialRuns:       typeof raw.partialRuns       === 'number' ? raw.partialRuns       : 0,
    failedRuns:        typeof raw.failedRuns        === 'number' ? raw.failedRuns        : 0,
    cancelledRuns:     typeof raw.cancelledRuns     === 'number' ? raw.cancelledRuns     : 0,
    lastStatus:        typeof raw.lastStatus        === 'string' ? raw.lastStatus as JobRuntimeState['lastStatus'] : null,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reads master-cycle-state.json.
 * Returns default idle state if file is missing or corrupt.
 * Never throws.
 */
export function readMasterCycleState(): MasterCycleState {
  const raw = storage.read(CYCLE_STATE_FILE)
  if (raw === null) return defaultCycleState()
  try {
    return migrateCycleState(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    return defaultCycleState()
  }
}

/**
 * Reads job-states.json in full.
 * Returns an empty JobStatesFile if file is missing or corrupt.
 * Never throws.
 */
export function readJobStates(): JobStatesFile {
  const rawStr = storage.read(JOB_STATES_FILE)
  if (rawStr === null) return defaultJobStatesFile()
  try {
    const raw = JSON.parse(rawStr) as Record<string, unknown>

    const rawJobs = (typeof raw.jobs === 'object' && raw.jobs !== null)
      ? raw.jobs as Record<string, Record<string, unknown>>
      : {}

    const jobs: Partial<Record<OpsJobType, JobRuntimeState>> = {}
    for (const [key, val] of Object.entries(rawJobs)) {
      if (typeof val === 'object' && val !== null) {
        jobs[key as OpsJobType] = migrateJobState(val as Record<string, unknown>)
      }
    }

    return {
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      jobs,
    }
  } catch {
    return defaultJobStatesFile()
  }
}

/**
 * Reads a single job's runtime state from job-states.json.
 * Returns null if the job has never run or file is corrupt.
 * Never throws.
 */
export function readJobState(jobType: OpsJobType): JobRuntimeState | null {
  const file = readJobStates()
  return file.jobs[jobType] ?? null
}

/**
 * Reads system-health.json.
 * Returns default healthy state if file is missing or corrupt.
 * Never throws.
 */
export function readSystemHealth(): SystemHealth {
  const rawStr = storage.read(SYSTEM_HEALTH_FILE)
  if (rawStr === null) return defaultSystemHealth()
  try {
    const raw = JSON.parse(rawStr) as Record<string, unknown>
    return {
      healthScore:    typeof raw.healthScore   === 'number'  ? Math.min(100, Math.max(0, raw.healthScore)) : 100,
      activePipeline: typeof raw.activePipeline === 'string' ? raw.activePipeline  : null,
      runningJobs:    Array.isArray(raw.runningJobs)         ? raw.runningJobs as OpsJobType[] : [],
      lastUpdatedAt:  typeof raw.lastUpdatedAt  === 'string' ? raw.lastUpdatedAt   : new Date().toISOString(),
    }
  } catch {
    return defaultSystemHealth()
  }
}
