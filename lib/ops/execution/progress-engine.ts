/**
 * lib/ops/execution/progress-engine.ts
 *
 * Helpers for tracking and updating job progress during execution.
 *
 * SERVER-ONLY.
 */

import type { ExecJobProgress } from './types'
import { updateProgress } from './queue-engine'

// ── Factories ─────────────────────────────────────────────────────────────────

export function createProgress(total = 0): ExecJobProgress {
  return {
    total,
    processed:  0,
    repaired:   0,
    suppressed: 0,
    recovered:  0,
    failed:     0,
    durationMs: 0,
    etaMs:      null,
  }
}

// ── Arithmetic ────────────────────────────────────────────────────────────────

export type ProgressOutcome =
  | 'repaired'
  | 'suppressed'
  | 'recovered'
  | 'failed'
  | 'processed'

/**
 * Returns a new progress object after recording one more product outcome.
 */
export function advanceProgress(
  p:       ExecJobProgress,
  outcome: ProgressOutcome,
  startMs: number,
): ExecJobProgress {
  const next = { ...p }
  next.processed++

  switch (outcome) {
    case 'repaired':   next.repaired++;   break
    case 'suppressed': next.suppressed++; break
    case 'recovered':  next.recovered++;  break
    case 'failed':     next.failed++;     break
    case 'processed':                     break
  }

  next.durationMs = Date.now() - startMs
  next.etaMs      = computeEta(next, startMs)

  return next
}

export function computeEta(p: ExecJobProgress, startMs: number): number | null {
  if (p.total <= 0 || p.processed <= 0) return null
  const elapsed = Date.now() - startMs
  const rate    = p.processed / elapsed           // items/ms
  const remaining = p.total - p.processed
  return remaining > 0 ? Math.round(remaining / rate) : 0
}

// ── Live updater ──────────────────────────────────────────────────────────────

/**
 * Returns a bound updater that writes progress to the job store.
 * Throttled to 1 write per 500ms to avoid hammering disk.
 */
export function makeProgressUpdater(jobId: string, startMs: number) {
  let lastWrite = 0
  let current   = createProgress()

  return {
    setTotal(total: number): void {
      current = { ...current, total }
    },
    advance(outcome: ProgressOutcome, product?: string): void {
      current = advanceProgress(current, outcome, startMs)
      if (product) current.currentProduct = product
      const now = Date.now()
      if (now - lastWrite > 500) {
        updateProgress(jobId, current)
        lastWrite = now
      }
    },
    flush(): void {
      current.durationMs = Date.now() - startMs
      updateProgress(jobId, current)
    },
    get(): ExecJobProgress {
      return current
    },
  }
}
