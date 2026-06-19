/**
 * lib/ops/automation/types.ts
 *
 * Core types for the GOODPRICE OPS V3 Automation Engine.
 *
 * An automation is a registered, configurable unit of work that can be
 * triggered on a schedule (scheduledHour) or at an interval (intervalMs).
 * The canonical automation is cycle-3am, but individual job types can also
 * be registered for independent on-demand execution.
 *
 * SERVER-ONLY.
 */

import type { OpsJobType, OpsLogStatus } from '../logs/types'

// ── Automation job types ──────────────────────────────────────────────────────

/**
 * Subset of OpsJobType that can be registered as automations.
 * Excludes 'recovery-pipeline' and 'manual-action' (not automatable).
 */
export type AutomationJobType = Extract<
  OpsJobType,
  | 'cycle-3am'
  | 'trust-recompute'
  | 'self-healing'
  | 'live-truth'
  | 'link-audit'
  | 'colombia-audit'
  | 'repair'
  | 'paapi-sync'
  | 'trm-update'
>

// ── Automation definition ─────────────────────────────────────────────────────

export interface AutomationDefinition {
  /** Unique stable identifier. */
  id:         string
  /** When false, the automation is known but not executed. */
  enabled:    boolean

  /**
   * For interval-based automations: minimum ms between executions.
   * null for schedule-based (use scheduledHour) or on-demand only.
   */
  intervalMs: number | null

  /** Hour of day (0-23) in `timezone` when this automation should run. */
  scheduledHour?: number
  /** IANA timezone name for scheduledHour. */
  timezone?:      string

  jobType: AutomationJobType
}

// ── Automation run state (persisted to automation-state.json) ─────────────────

export interface AutomationRunState {
  id:               string
  lastRunAt:        string | null    // ISO timestamp
  nextRunAt:        string | null    // ISO timestamp
  averageDurationMs: number          // Welford's rolling mean
  lastStatus:       OpsLogStatus | null
  totalRuns:        number
}

export interface AutomationStateFile {
  updatedAt:   string
  automations: Partial<Record<string, AutomationRunState>>
}

// ── Automation run result ─────────────────────────────────────────────────────

export interface AutomationRunResult {
  id:          string
  jobType:     AutomationJobType
  status:      OpsLogStatus
  startedAt:   string
  completedAt: string
  durationMs:  number
  errors:      string[]
  summary:     string
}
