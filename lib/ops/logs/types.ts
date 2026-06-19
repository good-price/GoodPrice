/**
 * lib/ops/logs/types.ts
 *
 * Core types for the GOODPRICE OPS V3 persistent log engine.
 * Every operational event — job run, cycle stage, manual action — produces
 * an OpsLog entry stored in data/ops/logs/YYYY-MM-DD.json.
 *
 * SERVER-ONLY.
 */

// ── Job types ─────────────────────────────────────────────────────────────────

export type OpsJobType =
  | 'cycle-3am'
  | 'trust-recompute'
  | 'self-healing'
  | 'live-truth'
  | 'link-audit'
  | 'colombia-audit'
  | 'repair'
  | 'paapi-sync'
  | 'trm-update'
  | 'recovery-pipeline'
  | 'catalog-fill'        // Sprint 3E — Catalog Fill Execution Engine
  | 'catalog-discovery'   // Sprint 4A — Amazon Discovery Engine
  | 'catalog-lifecycle'   // Sprint 4D — Product Lifecycle Engine
  | 'catalog-pricing'          // Sprint 4E — Product Intelligence & Pricing Memory Engine
  | 'catalog-recommendations'  // Sprint 4F — Recommendation Intelligence Engine
  | 'catalog-alerts'           // Sprint 4F — Alert Intelligence Engine
  | 'manual-action'

// ── Trigger origin ────────────────────────────────────────────────────────────

export type OpsTrigger =
  | 'scheduled'  // automated schedule (cron / Vercel Cron)
  | 'manual'     // operator-triggered from Automation Center
  | 'pipeline'   // sub-record emitted by a parent cycle run

// ── Run outcome ───────────────────────────────────────────────────────────────

export type OpsLogStatus =
  | 'success'    // all operations completed correctly
  | 'partial'    // some operations succeeded, some failed (non-required)
  | 'failed'     // critical failure — required operation did not complete
  | 'cancelled'  // operator-cancelled or aborted mid-run

// ── Concrete actions logged per run ──────────────────────────────────────────

export interface OpsLogActions {
  removed:    string[]   // ASINs removed from the public catalog
  repaired:   string[]   // ASINs whose images/metadata were repaired
  suppressed: string[]   // ASINs suppressed from public visibility
  recovered:  string[]   // ASINs recovered from suppression
  flagged:    string[]   // ASINs flagged for operator review
}

// ── Atomic log entry ──────────────────────────────────────────────────────────

export interface OpsLog {
  /** Unique identifier for this log entry (or pipelineId for cycle-3am). */
  id:           string

  jobType:      OpsJobType
  trigger:      OpsTrigger

  /** Set when this log belongs to a parent cycle run. */
  pipelineId?:  string

  startedAt:    string        // ISO 8601
  completedAt:  string | null // ISO 8601 — null if still running
  durationMs:   number        // wall-clock ms

  status:       OpsLogStatus

  /** One-line human-readable summary of what happened. */
  summary:      string

  actions:      OpsLogActions

  errors:       string[]
  warnings:     string[]
  notes:        string        // operator freeform, empty string by default
}

// ── Day file ──────────────────────────────────────────────────────────────────

export interface OpsLogDayFile {
  /** YYYY-MM-DD in America/Bogota timezone. */
  date:      string
  updatedAt: string
  /** Entries ordered newest-first. */
  logs:      OpsLog[]
}

// ── Index ─────────────────────────────────────────────────────────────────────

export interface OpsLogIndexEntry {
  /** YYYY-MM-DD in America/Bogota timezone. */
  date:            string
  totalRuns:       number
  failedRuns:      number
  successfulRuns:  number
  partialRuns:     number
  cancelledRuns:   number
  /** Outcome of the 3AM cycle run, null if no cycle ran that day. */
  cycleStatus:     OpsLogStatus | null
  /** Total duration of the cycle run in ms, null if no cycle ran. */
  cycleDurationMs: number | null
  /** ISO timestamp of the cycle run startedAt, null if no cycle ran. */
  lastCycleAt:     string | null
  updatedAt:       string
}

/** Ordered newest-first, max 90 entries. */
export type OpsLogIndex = OpsLogIndexEntry[]
