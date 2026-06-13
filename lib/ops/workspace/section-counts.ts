/**
 * lib/ops/workspace/section-counts.ts
 *
 * Pure helper: derives sidebar badge counts from an OpsSnapshot.
 * No fs/server imports — safe for both client and server bundles.
 */

import type { OpsSnapshot } from './types'

export interface SectionCounts {
  catalog:    number   // overrides active
  visibility: number   // suppressed + degraded
  recovery:   number   // recoverable suppressed count
  validation: number   // quarantine size
  repair:     number   // active repair jobs
  healing:    number   // active healing jobs
  operations: number   // active jobs total
  logs:       number   // recent events count
}

/**
 * Derives sidebar badge counts from the snapshot.
 * Pure function — safe to call in client components.
 */
export function buildSectionCounts(snapshot: OpsSnapshot): SectionCounts {
  return {
    catalog:    snapshot.overrideCount,
    visibility: snapshot.visibility.suppressed + snapshot.visibility.degraded,
    recovery:   snapshot.visibility.degraded,
    validation: 0,   // quarantine count — not loaded in fast snapshot
    repair:     snapshot.activeJobCount,
    healing:    0,
    operations: snapshot.activeJobCount,
    logs:       snapshot.recentEvents.length,
  }
}
