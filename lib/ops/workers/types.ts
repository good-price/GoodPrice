/**
 * lib/ops/workers/types.ts
 *
 * Worker interface contract for the GOODPRICE OPS V3 Master Cycle.
 *
 * Every cycle stage is backed by an OpsWorker — an async function that
 * executes a real catalog operation and returns a structured result that
 * the runner maps to an OpsLog entry and CycleStageResult.
 *
 * SERVER-ONLY.
 */

// ── Worker result ─────────────────────────────────────────────────────────────

export interface OpsWorkerResult {
  success: boolean

  /** One-line human-readable summary of what happened. */
  summary: string

  /** Concrete catalog mutations performed during this run. */
  actions: {
    /** ASINs removed from public catalog (quarantined / suppressed). */
    removed:    string[]
    /** ASINs whose metadata was repaired (image, price, etc.). */
    repaired:   string[]
    /** ASINs suppressed from public visibility (self-healing archive). */
    suppressed: string[]
    /** ASINs recovered from suppression. */
    recovered:  string[]
    /** ASINs flagged for operator review (bad truth score, dead link, etc.). */
    flagged:    string[]
  }

  warnings: string[]
  errors:   string[]
}

// ── Worker context ────────────────────────────────────────────────────────────

export interface OpsWorkerContext {
  /** Identifier of the parent cycle pipeline. Passed to sub-operations for tracing. */
  pipelineId: string
  /** Maximum wall-clock ms this worker is allowed to run. */
  timeoutMs:  number
}

// ── Worker contract ───────────────────────────────────────────────────────────

export type OpsWorker = (context: OpsWorkerContext) => Promise<OpsWorkerResult>
