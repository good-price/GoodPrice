/**
 * lib/ops/workers/index.ts
 *
 * Public API for the GOODPRICE OPS V3 Worker Registry.
 * Import from here — not from individual files within this module.
 *
 * Usage:
 *   import { WORKER_REGISTRY, getWorker } from '@/lib/ops/workers'
 *   import { runWithTimeout }             from '@/lib/ops/workers'
 */

export type { OpsWorkerResult, OpsWorkerContext, OpsWorker } from './types'
export { WORKER_REGISTRY, getWorker }  from './registry'
export { runWithTimeout, runBatched }  from './executor'
