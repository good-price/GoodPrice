/**
 * lib/ops/scheduler/types.ts
 *
 * Types for the GOODPRICE OPS V3 Countdown Engine and job schedule registry.
 *
 * SERVER-ONLY (nextRunAt calculations) + CLIENT-SAFE (types only).
 */

import type { OpsJobType, OpsLogStatus } from '../logs/types'

// ── Schedule configuration ─────────────────────────────────────────────────────

export interface ScheduledJobConfig {
  jobType:         OpsJobType
  label:           string
  description:     string
  /** Nominal interval between runs in milliseconds. */
  intervalMs:      number
  /** Human-readable schedule string, e.g. "Cada 6h". */
  schedule:        string
  /** True if this job is part of the Master Cycle pipeline. */
  partOfCycle:     boolean
  /** True if staleness of this job is included in the system health check. */
  healthMonitored: boolean
}

// ── Countdown results ─────────────────────────────────────────────────────────

export interface JobCountdown {
  jobType:        OpsJobType
  label:          string
  schedule:       string
  description:    string
  partOfCycle:    boolean

  lastRunAt:      string | null   // ISO — most recent completed run
  nextRunAt:      string | null   // ISO — computed: lastRunAt + intervalMs
  remainingMs:    number           // ms until nextRunAt (negative if overdue)
  isOverdue:      boolean

  lastStatus:     OpsLogStatus | null
  lastDurationMs: number | null
}

export interface CycleCountdown {
  /** ISO timestamp of the next 03:00 AM America/Bogota. */
  nextCycleAt:    string
  /** ms until the next cycle (positive = upcoming, negative = overdue). */
  remainingMs:    number
  isOverdue:      boolean

  lastRunAt:      string | null   // ISO — startedAt of last cycle-3am log
  lastStatus:     OpsLogStatus | null
  lastDurationMs: number | null
}

export interface AllCountdowns {
  cycle:  CycleCountdown
  jobs:   JobCountdown[]
}
