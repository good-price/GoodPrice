/**
 * lib/ops/workers/registry.ts
 *
 * Maps OpsJobType values to their concrete worker implementations.
 *
 * WORKER_REGISTRY is the single point of truth for which job types the
 * Master Cycle can execute. Adding a new job type means:
 *   1. Add it to OpsJobType in lib/ops/logs/types.ts
 *   2. Add a stage to MASTER_CYCLE in lib/ops/cycle/definition.ts
 *   3. Create a worker file in lib/ops/workers/
 *   4. Register it here
 *
 * Cycle stages not present in this registry are unregistered and will be
 * marked as failed by executeStage() — no silent skips.
 *
 * SERVER-ONLY.
 */

import type { OpsJobType }               from '../logs/types'
import type { OpsWorker }                from './types'
import { trustRecomputeWorker }          from './worker-trust-recompute'
import { selfHealingWorker }             from './worker-self-healing'
import { liveTruthWorker }               from './worker-live-truth'
import { linkAuditWorker }               from './worker-link-audit'
import { colombiaAuditWorker }           from './worker-colombia-audit'
import { repairWorker }                  from './worker-repair'

// ── Registry ──────────────────────────────────────────────────────────────────

export const WORKER_REGISTRY: Partial<Record<OpsJobType, OpsWorker>> = {
  'trust-recompute': trustRecomputeWorker,
  'self-healing':    selfHealingWorker,
  'live-truth':      liveTruthWorker,
  'link-audit':      linkAuditWorker,
  'colombia-audit':  colombiaAuditWorker,
  'repair':          repairWorker,
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Returns the registered worker for the given job type, or null if unregistered.
 * Callers must treat null as a fatal stage failure.
 */
export function getWorker(jobType: OpsJobType): OpsWorker | null {
  return WORKER_REGISTRY[jobType] ?? null
}
