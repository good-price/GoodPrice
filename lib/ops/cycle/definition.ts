/**
 * lib/ops/cycle/definition.ts
 *
 * Canonical definition of the GOODPRICE Master Cycle.
 *
 * Stage ordering is fixed and intentional:
 *   1. trust-recompute  — must run first to establish current visibility state
 *   2. self-healing     — depends on trust tiers computed in step 1
 *   3. live-truth       — validates prices/images against live Amazon data
 *   4. link-audit       — verifies Amazon page accessibility (Gate 9)
 *   5. colombia-audit   — verifies Colombia shipping availability
 *   6. repair           — repairs images/metadata after audits complete
 *
 * SERVER-ONLY.
 */

import type { MasterCycleDefinition } from './types'

export const MASTER_CYCLE: MasterCycleDefinition = {
  scheduleHour: 3,
  timezone:     'America/Bogota',
  stages: [
    {
      order:     1,
      jobType:   'trust-recompute',
      required:  true,
      timeoutMs: 5 * 60_000,    // 5 min
    },
    {
      order:     2,
      jobType:   'self-healing',
      required:  true,
      timeoutMs: 10 * 60_000,   // 10 min
    },
    {
      order:     3,
      jobType:   'live-truth',
      required:  false,
      timeoutMs: 15 * 60_000,   // 15 min
    },
    {
      order:     4,
      jobType:   'link-audit',
      required:  false,
      timeoutMs: 5 * 60_000,    // 5 min
    },
    {
      order:     5,
      jobType:   'colombia-audit',
      required:  false,
      timeoutMs: 5 * 60_000,    // 5 min
    },
    {
      order:     6,
      jobType:   'repair',
      required:  false,
      timeoutMs: 5 * 60_000,    // 5 min
    },
  ],
}
