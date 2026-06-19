/**
 * lib/ops/runtime/types.ts
 *
 * Runtime state types for GOODPRICE OPS V3.
 *
 * These files are written every cycle and every stage to give the
 * future Nerve Center UI a live view of what the system is doing.
 *
 * Files persisted to data/ops/runtime/:
 *   master-cycle-state.json  — current/last cycle + cumulative counters
 *   job-states.json          — per-job-type stats (no log scanning needed)
 *   system-health.json       — computed health snapshot
 *
 * SERVER-ONLY.
 */

import type { OpsJobType, OpsLogStatus } from '../logs/types'

// ── Master Cycle State ────────────────────────────────────────────────────────

export interface MasterCycleState {
  // ── Live status ───────────────────────────────────────────────────────────
  /** True while runMasterCycle() is executing. */
  isRunning:    boolean
  /** pipelineId of the currently running cycle, null when idle. */
  pipelineId:   string | null
  /** jobType of the stage currently executing, null between stages or when idle. */
  currentStage: string | null
  /** Order (1-indexed) of the stage currently executing, null when idle. */
  currentOrder: number | null
  /** ISO timestamp when the current cycle started, null when idle. */
  startedAt:    string | null
  /** Always null while running; set to completedAt when the cycle finishes. */
  completedAt:  string | null

  // ── Last completed cycle ──────────────────────────────────────────────────
  lastStartedAt:   string | null
  lastCompletedAt: string | null
  lastStatus:      OpsLogStatus | null
  /** Wall-clock duration of the last cycle in ms. */
  lastDurationMs:  number

  // ── Cumulative counters ───────────────────────────────────────────────────
  /** Total cycle invocations (including cancelled). */
  totalRuns:      number
  successfulRuns: number
  partialRuns:    number
  failedRuns:     number
  cancelledRuns:  number
}

// ── Job Runtime State ─────────────────────────────────────────────────────────

export interface JobRuntimeState {
  jobType:          OpsJobType

  lastRunAt:        string | null   // ISO timestamp
  lastDurationMs:   number          // wall-clock ms of most recent run
  /** Rolling mean via Welford's algorithm — no history file needed. */
  averageDurationMs: number

  totalRuns:        number
  successfulRuns:   number
  partialRuns:      number
  failedRuns:       number
  cancelledRuns:    number

  lastStatus:       OpsLogStatus | null
}

// ── Job States File ───────────────────────────────────────────────────────────

export interface JobStatesFile {
  updatedAt: string
  jobs:      Partial<Record<OpsJobType, JobRuntimeState>>
}

// ── System Health ─────────────────────────────────────────────────────────────

export interface SystemHealth {
  /** 0–100 score derived from recent cycle outcomes and per-job success rates. */
  healthScore:     number
  /** pipelineId of the cycle currently running, null when idle. */
  activePipeline:  string | null
  /** jobTypes currently executing (0 or 1 items in a sequential pipeline). */
  runningJobs:     OpsJobType[]
  lastUpdatedAt:   string
}
