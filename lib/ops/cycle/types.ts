/**
 * lib/ops/cycle/types.ts
 *
 * Types for the GOODPRICE OPS V3 Master Cycle orchestrator.
 *
 * The Master Cycle is the automated nightly pipeline that runs at 03:00 AM
 * America/Bogota and sequences all catalog maintenance jobs in order.
 *
 * SERVER-ONLY.
 */

import type { OpsJobType, OpsLogStatus } from '../logs/types'

// ── Cycle definition types ─────────────────────────────────────────────────────

export interface CycleStage {
  /** Execution order — 1-indexed, must be unique within a cycle. */
  order:     number
  jobType:   OpsJobType
  /**
   * If true: a failure in this stage aborts the entire cycle (status → failed).
   * If false: a failure is recorded but the cycle continues (status → partial).
   */
  required:  boolean
  /** Maximum wall-clock ms to allow before the stage is considered timed out. */
  timeoutMs: number
}

export interface MasterCycleDefinition {
  /** Hour of day in `timezone` at which the cycle runs. 3 = 03:00 AM. */
  scheduleHour: number
  /** IANA timezone identifier. */
  timezone:     string
  stages:       CycleStage[]
}

// ── Runtime result types ───────────────────────────────────────────────────────

export interface CycleStageResult {
  order:       number
  jobType:     OpsJobType
  status:      OpsLogStatus
  startedAt:   string   // ISO
  completedAt: string   // ISO
  durationMs:  number
  errors:      string[]
  warnings:    string[]
  /** Catalog mutations performed by this stage — accumulated into the cycle log. */
  actions: {
    removed:    string[]
    repaired:   string[]
    suppressed: string[]
    recovered:  string[]
    flagged:    string[]
  }
}

export interface CycleRunResult {
  pipelineId:       string
  startedAt:        string        // ISO — when the cycle began
  completedAt:      string        // ISO — when the last stage finished
  durationMs:       number        // total wall-clock ms
  status:           OpsLogStatus
  stagesRun:        number        // how many stages were attempted
  successfulStages: number        // stages that completed with status 'success'
  failedStages:     number        // stages that completed with status 'failed'
  stageResults:     CycleStageResult[]
  errors:           string[]      // cycle-level errors (e.g., required stage aborted)
  summary:          string        // human-readable one-liner
}
